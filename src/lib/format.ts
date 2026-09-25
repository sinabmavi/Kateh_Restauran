import { format, formatDistanceToNowStrict, parse, parseISO } from 'date-fns'
import { parseTimeToMinutes } from '../../supabase/functions/_shared/rules'

export function formatMoney(amount: number | null | undefined, currency = 'USD'): string {
  const value = Number(amount ?? 0)
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value)
  } catch {
    return `${currency} ${value.toFixed(2)}`
  }
}

/** `19:30:00` → `7:30 PM` */
export function formatTimeOfDay(time: string | null | undefined): string {
  const minutes = parseTimeToMinutes(time)
  if (minutes === null) return ''
  const hours24 = Math.floor(minutes / 60)
  const suffix = hours24 >= 12 ? 'PM' : 'AM'
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12
  return `${hours12}:${String(minutes % 60).padStart(2, '0')} ${suffix}`
}

/** `2026-05-18` → a local Date at midnight (never goes through UTC). */
export function parseDateOnly(value: string): Date {
  return parse(value, 'yyyy-MM-dd', new Date(2000, 0, 1))
}

export function formatDateOnly(value: string, pattern = 'EEE, d MMM yyyy'): string {
  return format(parseDateOnly(value), pattern)
}

export function formatTimestamp(value: string | null | undefined, pattern = 'd MMM, h:mm a'): string {
  if (!value) return ''
  return format(parseISO(value), pattern)
}

export function timeAgo(value: string): string {
  return formatDistanceToNowStrict(parseISO(value), { addSuffix: true })
}

export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** Monday-first ordering used everywhere opening hours are listed. */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

export function telHref(phone: string | null | undefined): string {
  return `tel:${(phone ?? '').replace(/[^+\d]/g, '')}`
}

export function pluralise(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

export function isValidPhone(value: string): boolean {
  return value.replace(/[^\d]/g, '').length >= 7
}

/** A real `yyyy-MM-dd` date in the past, no earlier than 1900. */
export function isValidBirthday(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  if (date.getUTCDate() !== Number(match[3])) return false
  return Number(match[1]) >= 1900 && date.getTime() < Date.now()
}
