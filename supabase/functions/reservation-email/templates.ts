// Branded reservation emails. Inline styles only: email clients ignore <style> blocks and external CSS.

export type EmailKind = 'received' | 'confirmed' | 'cancelled' | 'completed'

export interface EmailDetails {
  kind: EmailKind
  guestName: string
  restaurantName: string
  dateLabel: string
  timeLabel: string
  partySize: number
  tableName: string | null
  specialRequests: string | null
  reference: string
  depositLabel: string | null
  depositPaid: boolean
  refundDue: boolean
  address: string | null
  phone: string | null
  contactEmail: string
  siteUrl: string
  hasAccount: boolean
}

const COLORS = { espresso: '#1b130d', gold: '#b8791f', goldSoft: '#f5e6c8', cream: '#f6efe2', ink: '#2a211a', muted: '#7a6a5a', line: '#eadfcc' }

function escape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

interface Copy {
  subject: string
  heading: string
  intro: string
  badge: string
  badgeColor: string
}

function copyFor(details: EmailDetails): Copy {
  const when = `${details.dateLabel} at ${details.timeLabel}`
  switch (details.kind) {
    case 'received':
      return {
        subject: `We received your reservation for ${when}`,
        heading: 'Thank you for your reservation',
        intro: `We have received your booking at ${details.restaurantName}. Our team will review it shortly and you will get another email as soon as it is confirmed.`,
        badge: 'Received · Awaiting confirmation',
        badgeColor: COLORS.gold,
      }
    case 'confirmed':
      return {
        subject: `Your table is confirmed for ${when}`,
        heading: 'Your table is confirmed',
        intro: `Wonderful news: your table at ${details.restaurantName} is confirmed. We look forward to welcoming you. A calendar invitation is attached to this email.`,
        badge: 'Confirmed',
        badgeColor: '#2f7a4b',
      }
    case 'cancelled':
      return {
        subject: `Your reservation for ${when} has been cancelled`,
        heading: 'Your reservation has been cancelled',
        intro: details.refundDue
          ? `Your reservation at ${details.restaurantName} has been cancelled. The deposit you paid will be refunded to your PayPal account.`
          : `Your reservation at ${details.restaurantName} has been cancelled. If this is unexpected, please get in touch and we will be happy to help.`,
        badge: 'Cancelled',
        badgeColor: '#a33a2b',
      }
    case 'completed':
      return {
        subject: `Thank you for dining at ${details.restaurantName}`,
        heading: 'Thank you for dining with us',
        intro: `It was a pleasure to have you at ${details.restaurantName}. We hope you enjoyed your evening and look forward to seeing you again soon.`,
        badge: 'Completed',
        badgeColor: COLORS.muted,
      }
  }
}

function rows(details: EmailDetails): Array<[string, string]> {
  const list: Array<[string, string]> = [
    ['Date', details.dateLabel],
    ['Time', details.timeLabel],
    ['Guests', `${details.partySize} ${details.partySize === 1 ? 'guest' : 'guests'}`],
  ]
  if (details.tableName) list.push(['Table', details.tableName])
  list.push(['Name', details.guestName])
  if (details.depositLabel) list.push(['Deposit', `${details.depositLabel} · ${details.refundDue ? 'to be refunded' : details.depositPaid ? 'paid' : 'not paid'}`])
  if (details.specialRequests) list.push(['Special requests', details.specialRequests])
  list.push(['Reference', details.reference])
  return list
}

function button(href: string, label: string): string {
  return `<a href="${escape(href)}" style="display:inline-block;padding:14px 28px;border-radius:999px;background:${COLORS.gold};color:#ffffff;font-weight:700;font-size:14px;letter-spacing:0.06em;text-decoration:none;text-transform:uppercase">${escape(label)}</a>`
}

export function renderEmail(details: EmailDetails): { subject: string; html: string; text: string } {
  const copy = copyFor(details)
  const site = details.siteUrl.replace(/\/$/, '')
  const cta =
    details.kind === 'cancelled' || details.kind === 'completed'
      ? { href: `${site}/reserve`, label: 'Book a table' }
      : details.hasAccount
        ? { href: `${site}/account`, label: 'View my reservation' }
        : { href: site, label: 'Visit our website' }

  const detailRows = rows(details)
    .map(
      ([label, value]) =>
        `<tr><td style="padding:10px 0;border-bottom:1px solid ${COLORS.line};color:${COLORS.muted};font-size:14px;width:40%;vertical-align:top">${escape(label)}</td><td style="padding:10px 0;border-bottom:1px solid ${COLORS.line};color:${COLORS.ink};font-size:14px;font-weight:600;text-align:right">${escape(value)}</td></tr>`,
    )
    .join('')

  const contact = [details.address, details.phone, details.contactEmail].filter(Boolean).map((line) => escape(line!)).join('<br>')

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(copy.subject)}</title></head>
<body style="margin:0;padding:0;background:${COLORS.cream};font-family:Helvetica,Arial,sans-serif;color:${COLORS.ink}">
  <div style="display:none;max-height:0;overflow:hidden">${escape(copy.intro)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.cream};padding:32px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
        <tr><td align="center" style="padding:0 0 24px">
          <div style="font-family:Georgia,'Times New Roman',serif;font-size:24px;letter-spacing:0.28em;color:${COLORS.espresso}">${escape(details.restaurantName.toUpperCase())}</div>
          <div style="font-size:11px;letter-spacing:0.24em;color:${COLORS.gold};margin-top:6px">PERSIAN &amp; IRANIAN CUISINE</div>
        </td></tr>
        <tr><td style="background:#ffffff;border-radius:22px;padding:36px 32px;box-shadow:0 8px 30px rgba(27,19,13,0.08)">
          <div style="display:inline-block;padding:5px 12px;border-radius:999px;background:${COLORS.goldSoft};color:${copy.badgeColor};font-size:12px;font-weight:700;letter-spacing:0.04em">${escape(copy.badge)}</div>
          <h1 style="font-family:Georgia,'Times New Roman',serif;font-weight:600;font-size:28px;line-height:1.2;margin:18px 0 12px;color:${COLORS.espresso}">${escape(copy.heading)}</h1>
          <p style="margin:0 0 8px;font-size:15px;line-height:1.6">Dear ${escape(details.guestName)},</p>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6">${escape(copy.intro)}</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${COLORS.line}">${detailRows}</table>
          <div style="text-align:center;padding:30px 0 6px">${button(cta.href, cta.label)}</div>
        </td></tr>
        <tr><td align="center" style="padding:24px 12px 0;font-size:13px;line-height:1.6;color:${COLORS.muted}">
          <strong style="color:${COLORS.ink}">${escape(details.restaurantName)}</strong><br>${contact}
          <div style="margin-top:14px;font-size:12px">You are receiving this email because a table was reserved with this address.</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

  const text = [
    copy.heading,
    '',
    `Dear ${details.guestName},`,
    '',
    copy.intro,
    '',
    ...rows(details).map(([label, value]) => `${label}: ${value}`),
    '',
    `${cta.label}: ${cta.href}`,
    '',
    details.restaurantName,
    ...[details.address, details.phone, details.contactEmail].filter((line): line is string => Boolean(line)),
  ].join('\n')

  return { subject: copy.subject, html, text }
}

/** Calendar invitation for a confirmed booking. Times are wall-clock times in the restaurant's timezone. */
export function buildIcs(input: { uid: string; title: string; description: string; location: string; date: string; start: string; end: string; timezone: string }): string {
  const clean = (value: string) => value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
  const day = input.date.replace(/-/g, '')
  const time = (value: string) => value.slice(0, 8).replace(/:/g, '').padEnd(6, '0')
  const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Kateh Restaurant//Reservation//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${input.uid}@reservation`,
    `DTSTAMP:${now}`,
    `DTSTART;TZID=${input.timezone}:${day}T${time(input.start)}`,
    `DTEND;TZID=${input.timezone}:${day}T${time(input.end)}`,
    `SUMMARY:${clean(input.title)}`,
    `DESCRIPTION:${clean(input.description)}`,
    `LOCATION:${clean(input.location)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
}
