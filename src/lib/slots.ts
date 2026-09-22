import { addDays, addHours, addMinutes, format, getDay, startOfDay } from 'date-fns'
import {
  maxBookablePartySize,
  minutesToTime,
  overlaps,
  parseTimeToMinutes,
  slotStartMinutes,
  zonedNow,
} from '../../supabase/functions/_shared/rules'
import type { BlockedDate, BusinessHours, BusySlot, RestaurantSettings, RestaurantTable } from './types'

export interface Slot {
  start: Date
  end: Date
  label: string
  tableId: string
}

export type DayStatus = 'open' | 'closed' | 'blocked'

/** The restaurant's current wall-clock time as a local `Date`, independent of the visitor's timezone. */
export function restaurantNow(timezone: string): Date {
  const { floatingMs } = zonedNow(timezone)
  const floating = new Date(floatingMs)
  return new Date(
    floating.getUTCFullYear(),
    floating.getUTCMonth(),
    floating.getUTCDate(),
    floating.getUTCHours(),
    floating.getUTCMinutes(),
    floating.getUTCSeconds(),
  )
}

/** The next `count` calendar days starting from today at the restaurant. */
export function upcomingDates(timezone: string, count = 21): Date[] {
  const today = startOfDay(restaurantNow(timezone))
  return Array.from({ length: count }, (_, index) => addDays(today, index))
}

export function dateKey(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

export function dayStatus(date: Date, hours: BusinessHours[], blocked: BlockedDate[]): DayStatus {
  const key = dateKey(date)
  if (blocked.some((entry) => entry.blocked_date === key)) return 'blocked'
  const row = hours.find((entry) => entry.weekday === getDay(date))
  return row?.is_open ? 'open' : 'closed'
}

export function partySizeLimit(settings: RestaurantSettings, tables: RestaurantTable[]) {
  const activeCapacities = tables.filter((table) => table.is_active).map((table) => table.capacity)
  const max = maxBookablePartySize(settings.max_party_size, activeCapacities)
  return { max, exceeded: settings.max_party_size > max }
}

interface SlotInput {
  date: Date
  partySize: number
  settings: RestaurantSettings
  hours: BusinessHours[]
  blocked: BlockedDate[]
  tables: RestaurantTable[]
  busy: BusySlot[]
}

/**
 * Every bookable slot for one day. Only active tables that fit the party are used, the smallest free table wins,
 * and slots inside the notice window are skipped. The Edge Function re-validates all of this on submit.
 */
export function generateSlots({ date, partySize, settings, hours, blocked, tables, busy }: SlotInput): Slot[] {
  if (partySize < 1 || partySize > settings.max_party_size) return []
  if (dayStatus(date, hours, blocked) !== 'open') return []
  const row = hours.find((entry) => entry.weekday === getDay(date))
  if (!row) return []

  const fitting = tables
    .filter((table) => table.is_active && table.capacity >= partySize)
    .sort((a, b) => a.capacity - b.capacity || a.table_name.localeCompare(b.table_name))
  if (fitting.length === 0) return []

  const duration = settings.default_reservation_duration_minutes
  const earliest = addHours(restaurantNow(settings.timezone), settings.booking_notice_hours)
  const dayStart = startOfDay(date)

  const busyByTable = new Map<string, Array<[number, number]>>()
  for (const entry of busy) {
    const start = parseTimeToMinutes(entry.start_time)
    const end = parseTimeToMinutes(entry.end_time)
    if (start === null || end === null) continue
    const list = busyByTable.get(entry.table_id) ?? []
    list.push([start, end])
    busyByTable.set(entry.table_id, list)
  }

  const slots: Slot[] = []
  for (const startMinutes of slotStartMinutes(row, settings.slot_interval_minutes, duration)) {
    const start = addMinutes(dayStart, startMinutes)
    if (start < earliest) continue
    const endMinutes = startMinutes + duration
    const table = fitting.find((candidate) =>
      !(busyByTable.get(candidate.id) ?? []).some(([busyStart, busyEnd]) => overlaps(startMinutes, endMinutes, busyStart, busyEnd)),
    )
    if (!table) continue
    slots.push({ start, end: addMinutes(dayStart, endMinutes), label: format(start, 'h:mm a'), tableId: table.id })
  }
  return slots
}

/** `HH:mm:ss` for the slot start, the format stored in Postgres. */
export function slotTime(slot: Slot): string {
  return minutesToTime(slot.start.getHours() * 60 + slot.start.getMinutes())
}
