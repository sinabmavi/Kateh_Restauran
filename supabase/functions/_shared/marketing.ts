// Email Marketing rules shared by the dashboard and the marketing-email Edge Function:
// who receives an email, when automatic emails run, and how a message becomes a branded email.
// The preview in the dashboard and the email that is sent come from the same `renderEmail`.
// Pure functions only: no Deno or browser APIs.
import { addDaysToDateString, weekdayOf, zonedDayStartUtc, zonedNow } from './rules.ts'

/* ================================================================ customers */

export interface ClubCustomer {
  user_id: string
  full_name: string | null
  email: string | null
  phone: string | null
  /** `yyyy-MM-dd` */
  birthday: string | null
  joined_at: string
  email_confirmed: boolean
  marketing_opt_out: boolean
  orders_count: number
  reservations_count: number
  total_spent: number
  last_order_at: string | null
  last_reservation_at: string | null
  last_sign_in_at: string | null
}

/** Marketing email only ever goes to verified, subscribed addresses. */
export function isReachable(customer: ClubCustomer): boolean {
  return Boolean(customer.email) && customer.email_confirmed && !customer.marketing_opt_out
}

export function exclusionReason(customer: ClubCustomer): string | null {
  if (!customer.email) return 'No email address'
  if (!customer.email_confirmed) return 'Email not verified'
  if (customer.marketing_opt_out) return 'Unsubscribed'
  return null
}

/** Latest order or reservation, or null when the customer never ordered or booked. */
function lastVisitMs(customer: ClubCustomer): number | null {
  const times = [customer.last_order_at, customer.last_reservation_at].filter((value): value is string => Boolean(value)).map((value) => new Date(value).getTime())
  return times.length ? Math.max(...times) : null
}

/* ================================================================= audience */

export interface AudienceFilters {
  joinedWithinDays?: number | null
  lastVisit?: { op: 'within' | 'over'; days: number } | null
  orders?: { op: 'none' | 'at_least'; count: number } | null
  minSpent?: number | null
  birthday?: { when: 'today' | 'in_days' | 'next_7_days' | 'this_month'; days?: number } | null
}

export interface Audience {
  mode: 'all' | 'selected' | 'filtered'
  user_ids?: string[]
  filters?: AudienceFilters
  /** Skip customers who already got a marketing email within this many days. */
  skipRecentDays?: number | null
}

const DAY_MS = 86_400_000

/** `MM-dd` of a birthday in a given year; 29 February is celebrated on the 28th in other years. */
function birthdayIn(birthday: string, year: number): string {
  const monthDay = birthday.slice(5, 10)
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
  return monthDay === '02-29' && !leap ? '02-28' : monthDay
}

function birthdayMatches(birthday: string, rule: NonNullable<AudienceFilters['birthday']>, today: string): boolean {
  const dayMatches = (date: string) => birthdayIn(birthday, Number(date.slice(0, 4))) === date.slice(5, 10)
  switch (rule.when) {
    case 'today':
      return dayMatches(today)
    case 'in_days':
      return dayMatches(addDaysToDateString(today, Math.max(0, rule.days ?? 0)))
    case 'next_7_days':
      return Array.from({ length: 7 }, (_, offset) => addDaysToDateString(today, offset)).some(dayMatches)
    case 'this_month':
      return birthday.slice(5, 7) === today.slice(5, 7)
    default:
      return false
  }
}

export function matchesFilters(customer: ClubCustomer, filters: AudienceFilters, timezone: string, now: Date = new Date()): boolean {
  const nowMs = now.getTime()
  if (filters.joinedWithinDays && new Date(customer.joined_at).getTime() < nowMs - filters.joinedWithinDays * DAY_MS) return false
  if (filters.lastVisit) {
    const last = lastVisitMs(customer)
    const cutoff = nowMs - Math.max(1, filters.lastVisit.days) * DAY_MS
    if (filters.lastVisit.op === 'within' && (last === null || last < cutoff)) return false
    if (filters.lastVisit.op === 'over' && (last === null || last >= cutoff)) return false
  }
  if (filters.orders) {
    if (filters.orders.op === 'none' && customer.orders_count > 0) return false
    if (filters.orders.op === 'at_least' && customer.orders_count < Math.max(1, filters.orders.count)) return false
  }
  if (filters.minSpent && customer.total_spent < filters.minSpent) return false
  if (filters.birthday) {
    if (!customer.birthday) return false
    if (!birthdayMatches(customer.birthday, filters.birthday, zonedNow(timezone, now).date)) return false
  }
  return true
}

/** Everyone the audience targets before exclusions (used to explain who is skipped and why). */
export function targetedCustomers(customers: ClubCustomer[], audience: Audience, timezone: string, now: Date = new Date()): ClubCustomer[] {
  if (audience.mode === 'selected') {
    const ids = new Set(audience.user_ids ?? [])
    return customers.filter((customer) => ids.has(customer.user_id))
  }
  if (audience.mode === 'filtered') return customers.filter((customer) => matchesFilters(customer, audience.filters ?? {}, timezone, now))
  return customers
}

/** The customers who will actually receive the email. */
export function resolveAudience(customers: ClubCustomer[], audience: Audience, timezone: string, recentlyEmailed: Set<string> = new Set(), now: Date = new Date()): ClubCustomer[] {
  return targetedCustomers(customers, audience, timezone, now).filter((customer) => isReachable(customer) && !(audience.skipRecentDays && recentlyEmailed.has(customer.user_id)))
}

export function describeAudience(audience: Audience): string {
  if (audience.mode === 'all') return 'All subscribed customers'
  if (audience.mode === 'selected') {
    const count = audience.user_ids?.length ?? 0
    return `${count} selected ${count === 1 ? 'customer' : 'customers'}`
  }
  const f = audience.filters ?? {}
  const parts: string[] = []
  if (f.birthday) {
    parts.push(
      f.birthday.when === 'today'
        ? 'Birthday today'
        : f.birthday.when === 'in_days'
          ? `Birthday in ${f.birthday.days ?? 0} days`
          : f.birthday.when === 'next_7_days'
            ? 'Birthday this week'
            : 'Birthday this month',
    )
  }
  if (f.joinedWithinDays) parts.push(`Joined in last ${f.joinedWithinDays} days`)
  if (f.lastVisit) parts.push(f.lastVisit.op === 'within' ? `Visited in last ${f.lastVisit.days} days` : `No visit for ${f.lastVisit.days}+ days`)
  if (f.orders) parts.push(f.orders.op === 'none' ? 'Never ordered' : `${f.orders.count}+ orders`)
  if (f.minSpent) parts.push(`Spent ${f.minSpent}+`)
  return parts.length ? parts.join(' · ') : 'All subscribed customers'
}

/* ================================================================= schedule */

export type Frequency = 'daily' | 'weekdays' | 'monthly'
export type RepeatPolicy = 'every_run' | 'once' | 'monthly' | 'yearly'

export interface Schedule {
  frequency: Frequency
  /** `HH:mm` in the restaurant's timezone. */
  send_time: string
  /** 0 = Sunday … 6 = Saturday, for `weekdays`. */
  weekdays?: number[] | null
  month_day?: number | null
}

export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export const REPEAT_LABELS: Record<RepeatPolicy, string> = {
  every_run: 'Every time it runs',
  once: 'Only once',
  monthly: 'At most once a month',
  yearly: 'At most once a year',
}

export function describeSchedule(schedule: Schedule): string {
  const time = schedule.send_time.slice(0, 5)
  if (schedule.frequency === 'weekdays') {
    const days = [...(schedule.weekdays ?? [])].sort((a, b) => a - b)
    if (days.length === 7) return `Every day at ${time}`
    return `${days.map((day) => WEEKDAY_SHORT[day]).join(', ') || 'No days chosen'} at ${time}`
  }
  if (schedule.frequency === 'monthly') return `Monthly on day ${schedule.month_day ?? 1} at ${time}`
  return `Every day at ${time}`
}

export function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number)
  return Math.min(23, Math.max(0, hours || 0)) * 60 + Math.min(59, Math.max(0, minutes || 0))
}

function scheduleMatches(schedule: Schedule, date: string): boolean {
  if (schedule.frequency === 'weekdays') return (schedule.weekdays ?? []).includes(weekdayOf(date))
  if (schedule.frequency === 'monthly') return Number(date.slice(8, 10)) === Math.min(28, Math.max(1, schedule.month_day ?? 1))
  return true
}

/** The next moment (after `after`) this schedule fires, as a real UTC instant; null if it can never fire. */
export function nextRunAt(schedule: Schedule, timezone: string, after: Date = new Date()): Date | null {
  const minutes = timeToMinutes(schedule.send_time)
  const start = zonedNow(timezone, after).date
  for (let offset = 0; offset < 62; offset++) {
    const date = addDaysToDateString(start, offset)
    if (!scheduleMatches(schedule, date)) continue
    const at = zonedDayStartUtc(date, timezone).getTime() + minutes * 60_000
    if (at > after.getTime()) return new Date(at)
  }
  return null
}

/** Part of the de-duplication key: at most one email per customer per period. */
export function periodKey(policy: RepeatPolicy, runDate: string): string {
  if (policy === 'once') return 'once'
  if (policy === 'yearly') return runDate.slice(0, 4)
  if (policy === 'monthly') return runDate.slice(0, 7)
  return runDate
}

/* ================================================================== message */

export type ButtonTarget = 'menu' | 'reserve' | 'website' | 'custom'

export interface EmailMessage {
  type: string
  subject: string
  preheader: string
  eyebrow: string
  title: string
  subtitle: string
  /** Paragraphs separated by an empty line. */
  body: string
  image: { enabled: boolean; url: string; alt: string }
  offer: { enabled: boolean; label: string; code: string; note: string }
  button: { enabled: boolean; label: string; target: ButtonTarget; url: string }
  /** Sign-off, e.g. "Warm regards,\nThe team at Kateh Restaurant". */
  closing: string
}

export interface Brand {
  restaurantName: string
  siteUrl: string
  address: string | null
  phone: string | null
  unsubscribeUrl: string
}

export interface Recipient {
  fullName: string | null
  email: string
}

export const PERSONAL_TAGS = [
  { tag: '{first_name}', label: 'First name' },
  { tag: '{name}', label: 'Full name' },
  { tag: '{restaurant}', label: 'Restaurant name' },
]

function firstName(fullName: string | null): string {
  return (fullName ?? '').trim().split(/\s+/)[0] ?? ''
}

/** Replaces {first_name}, {name} and {restaurant}. Output is plain text (escape before putting it in HTML). */
export function fillTags(text: string, recipient: Recipient, brand: Brand): string {
  return text
    .replace(/\{\s*first_name\s*\}/gi, firstName(recipient.fullName) || 'there')
    .replace(/\{\s*name\s*\}/gi, recipient.fullName?.trim() || 'there')
    .replace(/\{\s*restaurant\s*\}/gi, brand.restaurantName)
}

export function buttonUrl(button: EmailMessage['button'], siteUrl: string): string {
  const site = siteUrl.replace(/\/$/, '')
  if (button.target === 'menu') return `${site}/menu`
  if (button.target === 'reserve') return `${site}/reserve`
  if (button.target === 'website') return site
  return /^https?:\/\//i.test(button.url.trim()) ? button.url.trim() : site
}

function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const C = { espresso: '#1b130d', gold: '#b8791f', goldSoft: '#f5e6c8', cream: '#f6efe2', ink: '#2a211a', muted: '#7a6a5a' }

/** Turns a message into a branded, email-client-safe HTML email plus a plain-text version. */
export function renderEmail(message: EmailMessage, recipient: Recipient, brand: Brand): { subject: string; preheader: string; html: string; text: string } {
  const fill = (value: string) => fillTags(value, recipient, brand)
  const rtl = /[؀-ۿ]/.test(`${message.title} ${message.body}`)
  const align = rtl ? 'right' : 'left'
  const dir = rtl ? ' dir="rtl"' : ''
  const site = brand.siteUrl.replace(/\/$/, '')
  const paragraphs = fill(message.body)
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
  const link = buttonUrl(message.button, site)

  const parts: string[] = []
  if (message.eyebrow.trim()) parts.push(`<div style="font-size:12px;letter-spacing:0.2em;text-transform:uppercase;color:${C.gold};font-weight:700">${esc(fill(message.eyebrow))}</div>`)
  parts.push(`<h1 style="font-family:Georgia,'Times New Roman',serif;font-weight:700;font-size:28px;line-height:1.25;margin:10px 0 ${message.subtitle.trim() ? '6px' : '16px'};color:${C.espresso}">${esc(fill(message.title))}</h1>`)
  if (message.subtitle.trim()) parts.push(`<p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:${C.muted};font-style:italic">${esc(fill(message.subtitle))}</p>`)
  if (message.image.enabled && message.image.url.trim()) {
    parts.push(`<img src="${esc(message.image.url.trim())}" alt="${esc(fill(message.image.alt || message.title))}" width="100%" style="display:block;width:100%;max-width:100%;height:auto;border-radius:14px;margin:4px 0 18px">`)
  }
  for (const paragraph of paragraphs) parts.push(`<p style="margin:0 0 14px;font-size:15px;line-height:1.7;color:${C.ink}">${esc(paragraph).replace(/\n/g, '<br>')}</p>`)
  if (message.offer.enabled && message.offer.code.trim()) {
    parts.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:10px 0 22px"><tr><td align="center" style="background:${C.goldSoft};border:1.5px dashed ${C.gold};border-radius:16px;padding:22px 16px">
      ${message.offer.label.trim() ? `<div style="font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:${C.muted};font-weight:700">${esc(fill(message.offer.label))}</div>` : ''}
      <div style="font-family:Georgia,'Times New Roman',serif;font-size:32px;font-weight:700;color:${C.espresso};margin-top:6px;letter-spacing:0.05em">${esc(fill(message.offer.code))}</div>
      ${message.offer.note.trim() ? `<div style="font-size:13px;color:${C.muted};margin-top:6px">${esc(fill(message.offer.note))}</div>` : ''}
    </td></tr></table>`)
  }
  if (message.button.enabled && message.button.label.trim()) {
    parts.push(`<div style="text-align:center;padding:6px 0 24px"><a href="${esc(link)}" style="display:inline-block;padding:15px 32px;border-radius:999px;background:${C.gold};color:#ffffff;font-weight:700;font-size:14px;letter-spacing:0.08em;text-decoration:none;text-transform:uppercase">${esc(fill(message.button.label))}</a></div>`)
  }
  if (message.closing.trim()) parts.push(`<p style="margin:0;font-size:15px;line-height:1.65;color:${C.ink}">${esc(fill(message.closing)).replace(/\n/g, '<br>')}</p>`)

  const contact = [brand.address, brand.phone].filter(Boolean).map((line) => esc(line!)).join(' · ')
  const preheader = fill(message.preheader)
  const html = `<!doctype html>
<html lang="${rtl ? 'fa' : 'en'}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(fill(message.subject))}</title></head>
<body style="margin:0;padding:0;background:${C.cream};font-family:Helvetica,Arial,sans-serif;color:${C.ink}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.cream};padding:28px 12px"><tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
    <tr><td align="center" style="padding:0 0 20px">
      <div style="font-family:Georgia,'Times New Roman',serif;font-size:24px;letter-spacing:0.28em;color:${C.espresso}">${esc(brand.restaurantName.toUpperCase())}</div>
      <div style="font-size:11px;letter-spacing:0.24em;color:${C.gold};margin-top:6px">PERSIAN &amp; IRANIAN CUISINE</div>
    </td></tr>
    <tr><td${dir} style="background:#ffffff;border-radius:22px;padding:34px 30px;text-align:${align}">
      ${parts.join('\n      ')}
    </td></tr>
    <tr><td align="center" style="padding:20px 12px 0;font-size:12px;line-height:1.7;color:${C.muted}">
      <a href="${esc(site)}" style="color:${C.gold};text-decoration:none">${esc(site.replace(/^https?:\/\//, ''))}</a> · <a href="${esc(site)}/menu" style="color:${C.gold};text-decoration:none">Menu</a> · <a href="${esc(site)}/reserve" style="color:${C.gold};text-decoration:none">Book a table</a><br>
      ${contact ? `${contact}<br>` : ''}You are receiving this email as a member of the ${esc(brand.restaurantName)} Customer Club.<br>
      <a href="${esc(brand.unsubscribeUrl)}" style="color:${C.muted}">Unsubscribe</a>
    </td></tr>
  </table>
</td></tr></table>
</body>
</html>`

  const text = [
    fill(message.eyebrow).toUpperCase(),
    fill(message.title),
    fill(message.subtitle),
    '',
    ...paragraphs.flatMap((paragraph) => [paragraph, '']),
    message.offer.enabled && message.offer.code.trim() ? `${fill(message.offer.label)}: ${fill(message.offer.code)}\n${fill(message.offer.note)}\n` : '',
    message.button.enabled && message.button.label.trim() ? `${fill(message.button.label)}: ${link}\n` : '',
    fill(message.closing),
    '',
    '—',
    brand.restaurantName,
    [brand.address, brand.phone].filter(Boolean).join(' · '),
    `Unsubscribe: ${brand.unsubscribeUrl}`,
  ]
    .filter((line) => line !== undefined)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return { subject: fill(message.subject), preheader, html, text }
}
