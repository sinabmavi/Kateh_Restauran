import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { HttpError, email, integer, phone, text } from './http.ts'
import {
  HOLD_MINUTES,
  floatingMs,
  isValidDateString,
  minutesToTime,
  overlaps,
  parseTimeToMinutes,
  slotStartMinutes,
  toCents,
  weekdayOf,
  zonedNow,
} from './rules.ts'
import type { BusinessHoursRow, ReservationRow, Settings, TableRow } from './types.ts'

export interface ReservationInput {
  full_name: string
  email: string
  phone: string
  party_size: number
  date: string
  start_time: string
  special_requests: string
}

export function parseReservationInput(body: Record<string, unknown>): ReservationInput {
  return {
    full_name: text(body.full_name, 'your name', { min: 2, max: 120 }),
    email: email(body.email),
    phone: phone(body.phone),
    party_size: integer(body.party_size, 'The party size', 1, 100),
    date: text(body.date, 'a date', { min: 10, max: 10 }),
    start_time: text(body.start_time, 'a time', { min: 4, max: 8 }),
    special_requests: text(body.special_requests ?? '', 'special requests', { max: 400 }),
  }
}

export async function loadSettings(admin: SupabaseClient): Promise<Settings> {
  const { data, error } = await admin.from('restaurant_settings').select('*').limit(1).maybeSingle()
  if (error || !data) throw new HttpError(500, 'NO_SETTINGS', 'The restaurant is not set up yet. Please contact us.')
  return data as Settings
}

const SLOT_TAKEN = () => new HttpError(409, 'SLOT_TAKEN', 'That time was just taken, please pick another.')

/** An unpaid hold older than HOLD_MINUTES no longer blocks a table (the database trigger applies the same rule). */
function isLiveBooking(row: ReservationRow, nowMs: number): boolean {
  if (row.status !== 'pending' && row.status !== 'confirmed') return false
  if (row.status === 'pending' && row.payment_status === 'unpaid') return nowMs - new Date(row.created_at).getTime() < HOLD_MINUTES * 60_000
  return true
}

interface Plan {
  settings: Settings
  startMinutes: number
  endMinutes: number
  /** Active tables that fit the party and are free for the slot, smallest first. */
  candidates: TableRow[]
}

/** Re-validates a booking request against opening hours, blocked dates, notice, tables and existing bookings. */
async function planBooking(admin: SupabaseClient, input: ReservationInput, settings: Settings, ignoreReservationId?: string): Promise<Plan> {
  if (!isValidDateString(input.date)) throw new HttpError(400, 'INVALID_INPUT', 'That date is not valid.')
  const startMinutes = parseTimeToMinutes(input.start_time)
  if (startMinutes === null) throw new HttpError(400, 'INVALID_INPUT', 'That time is not valid.')
  if (input.party_size > settings.max_party_size) throw new HttpError(422, 'PARTY_TOO_LARGE', 'For larger groups, please call us to reserve.')

  const [hoursRes, blockedRes, tablesRes, bookingsRes] = await Promise.all([
    admin.from('business_hours').select('*').eq('weekday', weekdayOf(input.date)).maybeSingle(),
    admin.from('blocked_dates').select('id').eq('blocked_date', input.date).maybeSingle(),
    admin.from('restaurant_tables').select('id, table_name, capacity').eq('is_active', true).gte('capacity', input.party_size),
    admin.from('reservations').select('*').eq('reservation_date', input.date).in('status', ['pending', 'confirmed']),
  ])
  for (const result of [hoursRes, blockedRes, tablesRes, bookingsRes]) {
    if (result.error) throw new HttpError(500, 'DB', 'We could not check availability. Please try again.')
  }

  const hours = hoursRes.data as BusinessHoursRow | null
  if (!hours || !hours.is_open) throw new HttpError(422, 'CLOSED', 'We are closed on that day. Please choose another date.')
  if (blockedRes.data) throw new HttpError(422, 'BLOCKED', 'That date is not available for reservations. Please choose another.')

  const duration = settings.default_reservation_duration_minutes
  if (!slotStartMinutes(hours, settings.slot_interval_minutes, duration).includes(startMinutes)) {
    throw new HttpError(422, 'BAD_SLOT', 'That time is outside our booking hours. Please pick one of the times offered.')
  }

  const now = zonedNow(settings.timezone)
  if (floatingMs(input.date, startMinutes) - now.floatingMs < settings.booking_notice_hours * 3_600_000) {
    throw new HttpError(422, 'TOO_SOON', `Reservations need at least ${settings.booking_notice_hours} hours' notice. Please pick a later time.`)
  }

  const endMinutes = startMinutes + duration
  const nowMs = Date.now()
  const busy = (bookingsRes.data as ReservationRow[]).filter((row) => row.id !== ignoreReservationId && isLiveBooking(row, nowMs))

  const candidates = (tablesRes.data as TableRow[])
    .filter((table) =>
      !busy.some((row) => {
        if (row.table_id !== table.id) return false
        const busyStart = parseTimeToMinutes(row.start_time)
        const busyEnd = parseTimeToMinutes(row.end_time)
        return busyStart !== null && busyEnd !== null && overlaps(startMinutes, endMinutes, busyStart, busyEnd)
      }),
    )
    .sort((a, b) => a.capacity - b.capacity || a.table_name.localeCompare(b.table_name))

  if (candidates.length === 0) throw SLOT_TAKEN()
  return { settings, startMinutes, endMinutes, candidates }
}

export interface HeldReservation {
  reservation: ReservationRow
  depositCents: number
}

/**
 * Validates the request, assigns the best-fit free table and inserts the reservation.
 * With a deposit the row starts as an unpaid hold; without one it is a normal pending reservation.
 */
export async function holdReservation(admin: SupabaseClient, input: ReservationInput, userId: string | null): Promise<HeldReservation & { settings: Settings }> {
  // Releases unpaid holds older than 15 minutes so they stop blocking tables. Service role only.
  const expiry = await admin.rpc('expire_unpaid_holds')
  if (expiry.error) console.error('expire_unpaid_holds failed', expiry.error.message)

  const settings = await loadSettings(admin)
  const plan = await planBooking(admin, input, settings)
  const depositCents = toCents(settings.reservation_deposit_per_guest) * input.party_size

  for (const table of plan.candidates) {
    const { data, error } = await admin
      .from('reservations')
      .insert({
        full_name: input.full_name,
        email: input.email,
        phone: input.phone,
        party_size: input.party_size,
        table_id: table.id,
        reservation_date: input.date,
        start_time: minutesToTime(plan.startMinutes),
        end_time: minutesToTime(plan.endMinutes),
        status: 'pending',
        special_requests: input.special_requests || null,
        user_id: userId,
        deposit_amount: depositCents / 100,
        payment_status: depositCents > 0 ? 'unpaid' : 'not_required',
      })
      .select()
      .single()

    if (!error) return { reservation: data as ReservationRow, depositCents, settings }
    // The database trigger is the final guard against double booking; try the next fitting table.
    if (!error.message.includes('TABLE_ALREADY_BOOKED')) {
      console.error('Reservation insert failed', error)
      throw new HttpError(500, 'DB', 'We could not save your reservation. Please try again.')
    }
  }
  throw SLOT_TAKEN()
}

/**
 * Late payment: the hold expired (and was cancelled) before the guest finished paying.
 * Try to bring the reservation back, on its own table first and then on any other free table.
 * Returns false when nothing is free any more, in which case the payment must be refunded.
 */
export async function reactivateReservation(admin: SupabaseClient, reservation: ReservationRow): Promise<boolean> {
  const settings = await loadSettings(admin)
  const startMinutes = parseTimeToMinutes(reservation.start_time)
  if (startMinutes === null) return false
  if (floatingMs(reservation.reservation_date, startMinutes) <= zonedNow(settings.timezone).floatingMs) return false

  const revive = async (tableId: string) => {
    const { data, error } = await admin
      .from('reservations')
      .update({ status: 'confirmed', payment_status: 'paid', table_id: tableId })
      .eq('id', reservation.id)
      .eq('status', 'cancelled')
      .select('id')
    return !error && (data?.length ?? 0) > 0
  }

  if (await revive(reservation.table_id)) return true

  let plan: Plan
  try {
    plan = await planBooking(
      admin,
      { full_name: reservation.full_name, email: reservation.email, phone: '', party_size: reservation.party_size, date: reservation.reservation_date, start_time: reservation.start_time, special_requests: '' },
      settings,
      reservation.id,
    )
  } catch {
    // Either nothing is free or the slot is no longer bookable (for example, inside the notice window).
    return false
  }
  for (const table of plan.candidates) if (await revive(table.id)) return true
  return false
}
