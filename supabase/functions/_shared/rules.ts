// Pure business rules shared by the browser (src/lib) and the Edge Functions.
// Keep this file free of imports and of Deno / DOM specific APIs so both runtimes can load it.
// The browser uses these rules to *offer* slots and delivery areas; the Edge Functions use the
// very same rules to *enforce* them, so the two can never disagree.

/** Unpaid reservation holds stop blocking a table after this many minutes (enforced in the database). */
export const HOLD_MINUTES = 15

export interface HoursLike {
  is_open: boolean
  start_time: string
  end_time: string
}

/* ------------------------------------------------------------------ money */

export function toCents(amount: number | string): number {
  return Math.round(Number(amount) * 100)
}

export function centsToDecimal(cents: number): string {
  return (cents / 100).toFixed(2)
}

/* ------------------------------------------------------------------- time */

/** Parses `HH:mm` or `HH:mm:ss` into minutes after midnight. Returns null when invalid. */
export function parseTimeToMinutes(value: string | null | undefined): number | null {
  if (!value) return null
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

/** Formats minutes after midnight as `HH:mm:ss`, the format stored in Postgres `time` columns. */
export function minutesToTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`
}

/** `yyyy-MM-dd` shape check that also rejects impossible dates such as 2026-02-31. */
export function isValidDateString(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const probe = new Date(Date.UTC(y, m - 1, d))
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d
}

/** Weekday of a `yyyy-MM-dd` calendar date: 0 = Sunday … 6 = Saturday (matches `business_hours.weekday`). */
export function weekdayOf(dateString: string): number {
  const [y, m, d] = dateString.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** Calendar-day arithmetic on a `yyyy-MM-dd` string, independent of any timezone. */
export function addDaysToDateString(dateString: string, days: number): string {
  const [y, m, d] = dateString.split('-').map(Number)
  const next = new Date(Date.UTC(y, m - 1, d + days))
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`
}

export interface ZonedNow {
  /** Restaurant-local calendar date, `yyyy-MM-dd`. */
  date: string
  /** Restaurant-local minutes after midnight. */
  minutes: number
  /** Restaurant-local wall clock encoded as a UTC epoch ("floating" time), comparable with `floatingMs`. */
  floatingMs: number
}

function zonedParts(timeZone: string, at: Date) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const parts: Record<string, number> = {}
  for (const part of formatter.formatToParts(at)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value)
  }
  return parts
}

/** "Now" as seen on the wall clock of the restaurant's timezone, not the visitor's device. */
export function zonedNow(timeZone: string, at: Date = new Date()): ZonedNow {
  let parts: Record<string, number>
  try {
    parts = zonedParts(timeZone, at)
  } catch {
    parts = zonedParts('UTC', at)
  }
  const hour = parts.hour === 24 ? 0 : parts.hour
  const date = `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
  return {
    date,
    minutes: hour * 60 + parts.minute,
    floatingMs: Date.UTC(parts.year, parts.month - 1, parts.day, hour, parts.minute, parts.second),
  }
}

/** Floating epoch for a restaurant-local `yyyy-MM-dd` + minutes-after-midnight. */
export function floatingMs(dateString: string, minutes: number): number {
  const [y, m, d] = dateString.split('-').map(Number)
  return Date.UTC(y, m - 1, d, 0, minutes)
}

/** The real UTC instant at which a restaurant-local calendar day starts. */
export function zonedDayStartUtc(dateString: string, timeZone: string): Date {
  const [y, m, d] = dateString.split('-').map(Number)
  const guess = Date.UTC(y, m - 1, d)
  const offsetAt = (instant: number) => zonedNow(timeZone, new Date(instant)).floatingMs - Math.floor(instant / 1000) * 1000
  let start = guess - offsetAt(guess)
  start = guess - offsetAt(start)
  return new Date(start)
}

/* --------------------------------------------------------- reservations */

/** Two time ranges overlap when `newStart < existingEnd && newEnd > existingStart`. */
export function overlaps(startA: number, endA: number, startB: number, endB: number): boolean {
  return startA < endB && endA > startB
}

/** Start times (minutes) of every bookable slot in one opening window. */
export function slotStartMinutes(hours: HoursLike, intervalMinutes: number, durationMinutes: number): number[] {
  if (!hours.is_open || intervalMinutes <= 0) return []
  const open = parseTimeToMinutes(hours.start_time)
  const close = parseTimeToMinutes(hours.end_time)
  if (open === null || close === null || close <= open) return []
  const starts: number[] = []
  for (let start = open; start + durationMinutes <= close; start += intervalMinutes) starts.push(start)
  return starts
}

/** Party sizes offered to guests: 1 … min(max_party_size, biggest active table). */
export function maxBookablePartySize(maxPartySize: number, tableCapacities: number[]): number {
  const largest = tableCapacities.length ? Math.max(...tableCapacities) : 0
  return Math.max(0, Math.min(maxPartySize, largest))
}

/* -------------------------------------------------------------- delivery */

/** Uppercases and strips spaces / dashes so `sw1a 1aa`, `SW1A-1AA` and `SW1A1AA` compare equal. */
export function normalisePostcode(value: string): string {
  return value.toUpperCase().replace(/[\s-]+/g, '')
}

export function parsePostcodeList(csv: string | null | undefined): string[] {
  if (!csv) return []
  return csv
    .split(',')
    .map(normalisePostcode)
    .filter(Boolean)
}

/** A postcode is deliverable when it starts with any listed entry. An empty list means "no restriction". */
export function isPostcodeDeliverable(postcode: string, csv: string | null | undefined): boolean {
  const allowed = parsePostcodeList(csv)
  if (allowed.length === 0) return true
  const candidate = normalisePostcode(postcode)
  return candidate.length > 0 && allowed.some((entry) => candidate.startsWith(entry))
}
