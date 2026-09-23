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
  /** Someone already holds this table for an overlapping time. Shown, but cannot be chosen. */
  booked: boolean
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

/** Tables in a natural order: "Table 2" before "Table 10". */
export function sortTables(tables: RestaurantTable[]): RestaurantTable[] {
  return [...tables].sort((a, b) => a.table_name.localeCompare(b.table_name, undefined, { numeric: true, sensitivity: 'base' }))
}

interface SlotInput {
  date: Date
  partySize: number
  settings: RestaurantSettings
  hours: BusinessHours[]
  blocked: BlockedDate[]
  table: RestaurantTable
  busy: BusySlot[]
}

/**
 * Every slot for one table on one day, with the ones that overlap an existing booking marked `booked`.
 * Slots inside the notice window are skipped. The Edge Function re-validates all of this on submit.
 */
export function generateSlots({ date, partySize, settings, hours, blocked, table, busy }: SlotInput): Slot[] {
  if (partySize < 1 || partySize > settings.max_party_size) return []
  if (!table.is_active || table.capacity < partySize) return []
  if (dayStatus(date, hours, blocked) !== 'open') return []
  const row = hours.find((entry) => entry.weekday === getDay(date))
  if (!row) return []

  const duration = settings.default_reservation_duration_minutes
  const earliest = addHours(restaurantNow(settings.timezone), settings.booking_notice_hours)
  const dayStart = startOfDay(date)

  const taken: Array<[number, number]> = []
  for (const entry of busy) {
    if (entry.table_id !== table.id) continue
    const start = parseTimeToMinutes(entry.start_time)
    const end = parseTimeToMinutes(entry.end_time)
    if (start !== null && end !== null) taken.push([start, end])
  }

  const slots: Slot[] = []
  for (const startMinutes of slotStartMinutes(row, settings.slot_interval_minutes, duration)) {
    const start = addMinutes(dayStart, startMinutes)
    if (start < earliest) continue
    const endMinutes = startMinutes + duration
    slots.push({
      start,
      end: addMinutes(dayStart, endMinutes),
      label: format(start, 'h:mm a'),
      tableId: table.id,
      booked: taken.some(([busyStart, busyEnd]) => overlaps(startMinutes, endMinutes, busyStart, busyEnd)),
    })
  }
  return slots
}

/** `HH:mm:ss` for the slot start, the format stored in Postgres. */
export function slotTime(slot: Slot): string {
  return minutesToTime(slot.start.getHours() * 60 + slot.start.getMinutes())
}
