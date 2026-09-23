// reservation-email: emails the guest from info@kateh.io (Hostinger SMTP) when a reservation is made or its status changes.
// Called by a database trigger with only { reservation_id }. Everything else is re-read here, and each state is emailed
// at most once, so calling it by hand can never send anything other than the one email the booking is due.
import nodemailer from 'npm:nodemailer@6.9.16'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { serviceClient } from '../_shared/clients.ts'
import { HttpError, handle, json, readJson } from '../_shared/http.ts'
import { buildIcs, renderEmail, type EmailKind } from './templates.ts'

interface Reservation {
  id: string
  full_name: string
  email: string
  party_size: number
  table_id: string | null
  reservation_date: string
  start_time: string
  end_time: string
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed'
  payment_status: 'not_required' | 'unpaid' | 'paid' | 'refunded'
  special_requests: string | null
  deposit_amount: number | null
  user_id: string | null
}

interface RestaurantInfo {
  restaurant_name: string
  restaurant_email: string | null
  restaurant_phone: string | null
  restaurant_address: string | null
  timezone: string
  currency: string
}

/** Which email the booking's current state calls for. Unpaid deposit holds get nothing until the payment lands. */
function kindFor(reservation: Reservation): EmailKind | null {
  switch (reservation.status) {
    case 'pending':
      return reservation.payment_status === 'unpaid' ? null : 'received'
    case 'confirmed':
      return 'confirmed'
    case 'cancelled':
      return 'cancelled'
    case 'completed':
      return 'completed'
    default:
      return null
  }
}

function dateLabel(date: string): string {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`))
}

function timeLabel(time: string): string {
  const [hours, minutes] = time.split(':').map(Number)
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, 0, 1, hours ?? 0, minutes ?? 0)))
}

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

/**
 * Records that `kind` is being sent, atomically. Returns the previous state (to restore if sending fails),
 * or `false` when this email was already sent. Cancelled/completed emails only go to guests who were emailed before,
 * so abandoned deposit holds that expire never produce a "cancelled" email.
 */
async function claim(admin: SupabaseClient, reservationId: string, kind: EmailKind, to: string): Promise<{ previous: string | null } | false> {
  const existing = await admin.from('reservation_emails').select('last_kind').eq('reservation_id', reservationId).maybeSingle()
  if (existing.error) throw new HttpError(500, 'DB', existing.error.message)
  const previous = (existing.data as { last_kind: string } | null)?.last_kind ?? null

  if (previous === null) {
    if (kind === 'cancelled' || kind === 'completed') return false
    const inserted = await admin.from('reservation_emails').insert({ reservation_id: reservationId, last_kind: kind, sent_to: to })
    if (!inserted.error) return { previous: null }
    if (inserted.error.code !== '23505') throw new HttpError(500, 'DB', inserted.error.message)
    return false
  }

  const updated = await admin
    .from('reservation_emails')
    .update({ last_kind: kind, sent_to: to, updated_at: new Date().toISOString() })
    .eq('reservation_id', reservationId)
    .eq('last_kind', previous)
    .neq('last_kind', kind)
    .select('reservation_id')
  if (updated.error) throw new HttpError(500, 'DB', updated.error.message)
  return (updated.data?.length ?? 0) > 0 ? { previous } : false
}

async function release(admin: SupabaseClient, reservationId: string, previous: string | null): Promise<void> {
  if (previous === null) await admin.from('reservation_emails').delete().eq('reservation_id', reservationId)
  else await admin.from('reservation_emails').update({ last_kind: previous }).eq('reservation_id', reservationId)
}

Deno.serve(
  handle(async (request) => {
    const body = await readJson(request)
    const reservationId = typeof body.reservation_id === 'string' ? body.reservation_id.trim() : ''
    if (!/^[A-Za-z0-9-]{8,64}$/.test(reservationId)) throw new HttpError(400, 'BAD_REQUEST', 'Missing reservation.')

    const smtpUser = Deno.env.get('SMTP_USER')
    const smtpPass = Deno.env.get('SMTP_PASS')
    if (!smtpUser || !smtpPass) {
      console.error('reservation-email: SMTP_USER / SMTP_PASS secrets are not set')
      return json({ sent: false, reason: 'not_configured' })
    }

    const admin = serviceClient()
    const found = await admin.from('reservations').select('*').eq('id', reservationId).maybeSingle()
    if (found.error) throw new HttpError(500, 'DB', found.error.message)
    const reservation = found.data as Reservation | null
    if (!reservation) return json({ sent: false, reason: 'not_found' })

    const kind = kindFor(reservation)
    if (!kind) return json({ sent: false, reason: 'nothing_to_send' })

    const claimed = await claim(admin, reservation.id, kind, reservation.email)
    if (!claimed) return json({ sent: false, reason: 'already_sent' })

    try {
      const [settingsRes, tableRes] = await Promise.all([
        admin.from('restaurant_settings').select('restaurant_name, restaurant_email, restaurant_phone, restaurant_address, timezone, currency').limit(1).maybeSingle(),
        reservation.table_id ? admin.from('restaurant_tables').select('table_name').eq('id', reservation.table_id).maybeSingle() : Promise.resolve({ data: null }),
      ])
      const settings = (settingsRes.data ?? { restaurant_name: 'Kateh Restaurant', restaurant_email: null, restaurant_phone: null, restaurant_address: null, timezone: 'UTC', currency: 'EUR' }) as RestaurantInfo
      const tableName = (tableRes.data as { table_name: string } | null)?.table_name ?? null

      const from = Deno.env.get('EMAIL_FROM') || smtpUser
      const siteUrl = Deno.env.get('SITE_URL') || 'https://kateh.io'
      const deposit = Number(reservation.deposit_amount ?? 0)

      const email = renderEmail({
        kind,
        guestName: reservation.full_name,
        restaurantName: settings.restaurant_name,
        dateLabel: dateLabel(reservation.reservation_date),
        timeLabel: timeLabel(reservation.start_time),
        partySize: reservation.party_size,
        tableName,
        specialRequests: reservation.special_requests,
        reference: reservation.id.slice(0, 8).toUpperCase(),
        depositLabel: deposit > 0 ? money(deposit, settings.currency) : null,
        depositPaid: reservation.payment_status === 'paid' || reservation.payment_status === 'refunded',
        refundDue: reservation.status === 'cancelled' && reservation.payment_status === 'paid',
        address: settings.restaurant_address,
        phone: settings.restaurant_phone,
        contactEmail: settings.restaurant_email || from,
        siteUrl,
        hasAccount: Boolean(reservation.user_id),
      })

      const attachments =
        kind === 'confirmed'
          ? [
              {
                filename: 'reservation.ics',
                contentType: 'text/calendar; charset=utf-8; method=PUBLISH',
                content: buildIcs({
                  uid: reservation.id,
                  title: `Dinner at ${settings.restaurant_name}`,
                  description: `Table for ${reservation.party_size}. Reference ${reservation.id.slice(0, 8).toUpperCase()}.`,
                  location: settings.restaurant_address ?? settings.restaurant_name,
                  date: reservation.reservation_date,
                  start: reservation.start_time,
                  end: reservation.end_time,
                  timezone: settings.timezone,
                }),
              },
            ]
          : []

      const port = Number(Deno.env.get('SMTP_PORT') || 465)
      const transport = nodemailer.createTransport({
        host: Deno.env.get('SMTP_HOST') || 'smtp.hostinger.com',
        port,
        secure: port === 465,
        auth: { user: smtpUser, pass: smtpPass },
      })

      await transport.sendMail({
        from: { name: settings.restaurant_name, address: from },
        to: { name: reservation.full_name, address: reservation.email },
        replyTo: settings.restaurant_email || from,
        subject: email.subject,
        html: email.html,
        text: email.text,
        attachments,
      })

      return json({ sent: true, kind })
    } catch (failure) {
      await release(admin, reservation.id, claimed.previous)
      console.error('reservation-email: sending failed', failure)
      throw new HttpError(502, 'SEND_FAILED', 'The email could not be sent.')
    }
  }),
)
