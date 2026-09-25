// marketing-email: Customer Club emails from info@kateh.io.
//   POST { action: 'tick' }                       every minute (pg_cron): scheduled + automatic emails, then the queue
//   POST { action: 'send_now', email_id }         admin: send a one-off email right away
//   POST { action: 'run_now', email_id }          admin: run an automatic email right away
//   POST { action: 'retry_failed', run_id }       admin: try failed recipients of a send-out again
//   POST { action: 'send_test', message }         admin: send a preview to the test addresses (or the admin)
//   POST { action: 'unsubscribe' | 'resubscribe', u, t }   from the website's /unsubscribe page
// Every recipient gets a row in marketing_sends with a status and, on failure, a readable reason.
// No tracking pixels or link rewriting: they hurt inbox placement for a small sender.
import type { SupabaseClient, User } from 'npm:@supabase/supabase-js@2'
import { getUser, serviceClient } from '../_shared/clients.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { HttpError, json, readJson } from '../_shared/http.ts'
import { createMailer, describeMailError, senderAddress } from '../_shared/mailer.ts'
import {
  nextRunAt,
  periodKey,
  renderEmail,
  resolveAudience,
  timeToMinutes,
  type Audience,
  type Brand,
  type ClubCustomer,
  type EmailMessage,
  type RepeatPolicy,
  type Schedule,
} from '../_shared/marketing.ts'
import { zonedNow } from '../_shared/rules.ts'

const SITE_URL = (Deno.env.get('SITE_URL') || 'https://kateh.io').replace(/\/$/, '')
const STALE_MS = 10 * 60_000
const MAX_ATTEMPTS = 3

interface Restaurant {
  restaurant_name: string
  restaurant_email: string | null
  restaurant_phone: string | null
  restaurant_address: string | null
  timezone: string
}

interface MarketingSettings {
  sender_name: string | null
  reply_to: string | null
  test_emails: string | null
  batch_size: number
  quiet_start: string | null
  quiet_end: string | null
}

interface Context {
  restaurant: Restaurant
  settings: MarketingSettings
}

interface MarketingEmail extends Partial<Schedule> {
  id: string
  name: string
  message: EmailMessage
  audience: Audience
  mode: 'now' | 'scheduled' | 'automatic'
  status: string
  repeat_policy: RepeatPolicy
  next_run_at: string | null
}

interface QueuedSend {
  id: number
  run_id: string
  user_id: string | null
  email: string
  full_name: string | null
  attempts: number
}

/* ------------------------------------------------------------------- helpers */

async function sign(value: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)))
  return btoa(String.fromCharCode(...signature)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '').slice(0, 32)
}

async function loadContext(admin: SupabaseClient): Promise<Context> {
  const [restaurantRes, settingsRes] = await Promise.all([
    admin.from('restaurant_settings').select('restaurant_name, restaurant_email, restaurant_phone, restaurant_address, timezone').limit(1).maybeSingle(),
    admin.from('marketing_settings').select('*').eq('id', 1).maybeSingle(),
  ])
  return {
    restaurant: (restaurantRes.data as Restaurant | null) ?? { restaurant_name: 'Kateh Restaurant', restaurant_email: null, restaurant_phone: null, restaurant_address: null, timezone: 'UTC' },
    settings: (settingsRes.data as MarketingSettings | null) ?? { sender_name: null, reply_to: null, test_emails: null, batch_size: 40, quiet_start: null, quiet_end: null },
  }
}

async function loadCustomers(admin: SupabaseClient): Promise<ClubCustomer[]> {
  const { data, error } = await admin.rpc('admin_customer_directory')
  if (error) throw new HttpError(500, 'DB', `Could not load customers: ${error.message}`)
  return ((data ?? []) as ClubCustomer[]).map((row) => ({ ...row, total_spent: Number(row.total_spent ?? 0) }))
}

async function recentlyEmailed(admin: SupabaseClient, days: number | null | undefined): Promise<Set<string>> {
  if (!days) return new Set()
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  const { data } = await admin.from('marketing_sends').select('user_id').eq('status', 'sent').gte('sent_at', since).limit(20_000)
  return new Set(((data ?? []) as Array<{ user_id: string | null }>).map((row) => row.user_id).filter((id): id is string => Boolean(id)))
}

function inQuietHours(ctx: Context): boolean {
  const { quiet_start: start, quiet_end: end } = ctx.settings
  if (!start || !end) return false
  const now = zonedNow(ctx.restaurant.timezone).minutes
  const [from, to] = [timeToMinutes(start), timeToMinutes(end)]
  if (from === to) return false
  return from < to ? now >= from && now < to : now >= from || now < to
}

async function brandFor(ctx: Context, userId: string | null): Promise<Brand> {
  const unsubscribeUrl = userId ? `${SITE_URL}/unsubscribe?u=${userId}&t=${await sign(`unsub:${userId}`)}` : `${SITE_URL}/account`
  return { restaurantName: ctx.restaurant.restaurant_name, siteUrl: SITE_URL, address: ctx.restaurant.restaurant_address, phone: ctx.restaurant.restaurant_phone, unsubscribeUrl }
}

/* --------------------------------------------------------------------- runs */

/** Creates a send-out and queues one row per recipient. Returns the run id, or null when nobody is due. */
async function startRun(admin: SupabaseClient, email: MarketingEmail, kind: 'one_off' | 'automatic', recipients: ClubCustomer[], key: (customer: ClubCustomer) => string, keepEmpty: boolean) {
  if (recipients.length === 0 && !keepEmpty) return null
  const { data: run, error } = await admin
    .from('marketing_runs')
    .insert({ email_id: email.id, name: email.name, subject: email.message.subject, kind, message: email.message, recipients_count: recipients.length, status: recipients.length ? 'sending' : 'sent', finished_at: recipients.length ? null : new Date().toISOString() })
    .select('id')
    .single()
  if (error || !run) throw new HttpError(500, 'DB', `Could not start sending: ${error?.message}`)

  for (let index = 0; index < recipients.length; index += 500) {
    const rows = recipients.slice(index, index + 500).map((customer) => ({ run_id: run.id, email_id: email.id, user_id: customer.user_id, email: customer.email, full_name: customer.full_name, dedupe_key: key(customer) }))
    const { error: queueError } = await admin.from('marketing_sends').upsert(rows, { onConflict: 'dedupe_key', ignoreDuplicates: true })
    if (queueError) throw new HttpError(500, 'DB', `Could not queue emails: ${queueError.message}`)
  }

  // Customers who already received this email are skipped by the unique key; record the real number.
  const { count } = await admin.from('marketing_sends').select('id', { count: 'exact', head: true }).eq('run_id', run.id)
  if (recipients.length && !count && !keepEmpty) {
    await admin.from('marketing_runs').delete().eq('id', run.id)
    return null
  }
  await admin.from('marketing_runs').update({ recipients_count: count ?? 0, ...(count ? {} : { status: 'sent', finished_at: new Date().toISOString() }) }).eq('id', run.id)
  return run.id as string
}

async function finishRuns(admin: SupabaseClient, runIds: Set<string>) {
  const count = async (runId: string, status: string) => (await admin.from('marketing_sends').select('id', { count: 'exact', head: true }).eq('run_id', runId).eq('status', status)).count ?? 0
  for (const runId of runIds) {
    const [sent, failed, queued, sending] = await Promise.all([count(runId, 'sent'), count(runId, 'failed'), count(runId, 'queued'), count(runId, 'sending')])
    const done = queued + sending === 0
    const status = !done ? 'sending' : failed === 0 ? 'sent' : sent === 0 ? 'failed' : 'partial'
    const { data } = await admin
      .from('marketing_runs')
      .update({ sent_count: sent, failed_count: failed, status, finished_at: done ? new Date().toISOString() : null })
      .eq('id', runId)
      .select('email_id, kind')
    const run = data?.[0] as { email_id: string | null; kind: string } | undefined
    if (done && run?.kind === 'one_off' && run.email_id) {
      await admin.from('marketing_emails').update({ status: sent === 0 && failed > 0 ? 'failed' : 'sent', updated_at: new Date().toISOString() }).eq('id', run.email_id)
    }
  }
}

/** Sends queued emails within the batch size and time budget. The rest is picked up by the next tick. */
async function processQueue(admin: SupabaseClient, ctx: Context, deadline: number, runFilter?: string) {
  const messages = new Map<string, EmailMessage>()
  const touched = new Set<string>()
  const limit = Math.max(1, ctx.settings.batch_size || 40)
  let sent = 0
  let failed = 0
  let firstError: string | null = null
  let mailer: ReturnType<typeof createMailer> | null = null

  try {
    while (sent + failed < limit && Date.now() < deadline) {
      let query = admin.from('marketing_sends').select('id').eq('status', 'queued').order('id', { ascending: true }).limit(Math.min(10, limit - sent - failed))
      if (runFilter) query = query.eq('run_id', runFilter)
      const { data: next } = await query
      if (!next?.length) break
      const { data: claimed } = await admin
        .from('marketing_sends')
        .update({ status: 'sending', claimed_at: new Date().toISOString() })
        .in('id', next.map((row) => row.id))
        .eq('status', 'queued')
        .select('id, run_id, user_id, email, full_name, attempts')

      for (const row of (claimed ?? []) as QueuedSend[]) {
        touched.add(row.run_id)
        if (!messages.has(row.run_id)) {
          const { data } = await admin.from('marketing_runs').select('message').eq('id', row.run_id).maybeSingle()
          messages.set(row.run_id, (data as { message: EmailMessage } | null)?.message as EmailMessage)
        }
        try {
          const message = messages.get(row.run_id)
          if (!message) throw new Error('The message for this send-out was not found.')
          mailer ??= createMailer()
          const brand = await brandFor(ctx, row.user_id)
          const email = renderEmail(message, { fullName: row.full_name, email: row.email }, brand)
          await mailer.send({
            fromName: ctx.settings.sender_name || ctx.restaurant.restaurant_name,
            to: row.email,
            toName: row.full_name,
            replyTo: ctx.settings.reply_to || ctx.restaurant.restaurant_email,
            subject: email.subject,
            html: email.html,
            text: email.text,
            headers: { 'List-Unsubscribe': `<mailto:${senderAddress()}?subject=unsubscribe>, <${brand.unsubscribeUrl}>` },
          })
          await admin.from('marketing_sends').update({ status: 'sent', sent_at: new Date().toISOString(), error: null, attempts: row.attempts + 1 }).eq('id', row.id)
          sent++
        } catch (error) {
          const { message, temporary } = describeMailError(error)
          const retry = temporary && row.attempts + 1 < MAX_ATTEMPTS
          console.error('marketing-email: send failed', row.email, message)
          await admin.from('marketing_sends').update({ status: retry ? 'queued' : 'failed', error: message, attempts: row.attempts + 1 }).eq('id', row.id)
          firstError ??= message
          if (!retry) failed++
          if (/mailbox login was refused|SMTP_PASS/.test(message)) {
            // Wrong credentials fail every email the same way; stop instead of burning through the queue.
            break
          }
        }
      }
      if (firstError && /mailbox login was refused|SMTP_PASS/.test(firstError)) break
    }
  } finally {
    mailer?.close()
    await finishRuns(admin, touched)
  }
  return { sent, failed, firstError }
}

/* ------------------------------------------------------------------ actions */

async function tick(admin: SupabaseClient) {
  const ctx = await loadContext(admin)
  const now = new Date()
  const nowIso = now.toISOString()
  let customers: ClubCustomer[] | null = null
  const directory = async () => (customers ??= await loadCustomers(admin))

  await admin.from('marketing_sends').update({ status: 'queued' }).eq('status', 'sending').lt('claimed_at', new Date(now.getTime() - STALE_MS).toISOString())

  const { data: scheduled } = await admin.from('marketing_emails').select('*').eq('status', 'scheduled').lte('send_at', nowIso)
  for (const email of (scheduled ?? []) as MarketingEmail[]) {
    const { data: claimed } = await admin.from('marketing_emails').update({ status: 'sending', updated_at: nowIso }).eq('id', email.id).eq('status', 'scheduled').select('id')
    if (!claimed?.length) continue
    const recipients = resolveAudience(await directory(), email.audience, ctx.restaurant.timezone, await recentlyEmailed(admin, email.audience.skipRecentDays))
    const runId = await startRun(admin, email, 'one_off', recipients, (customer) => `e:${email.id}:${customer.user_id}`, true)
    if (runId) await finishRuns(admin, new Set([runId]))
  }

  const { data: automatic } = await admin.from('marketing_emails').select('*').eq('mode', 'automatic').eq('status', 'active').lte('next_run_at', nowIso)
  for (const email of (automatic ?? []) as MarketingEmail[]) {
    const next = nextRunAt(email as Schedule, ctx.restaurant.timezone, now)
    const { data: claimed } = await admin
      .from('marketing_emails')
      .update({ next_run_at: next?.toISOString() ?? null, last_run_at: nowIso })
      .eq('id', email.id)
      .eq('next_run_at', email.next_run_at ?? '')
      .select('id')
    if (!claimed?.length) continue
    const period = periodKey(email.repeat_policy, zonedNow(ctx.restaurant.timezone, now).date)
    const recipients = resolveAudience(await directory(), email.audience, ctx.restaurant.timezone, await recentlyEmailed(admin, email.audience.skipRecentDays))
    await startRun(admin, email, 'automatic', recipients, (customer) => `a:${email.id}:${customer.user_id}:${period}`, false)
  }

  if (inQuietHours(ctx)) return { quietHours: true, sent: 0 }
  const result = await processQueue(admin, ctx, Date.now() + 45_000)
  return { quietHours: false, ...result }
}

async function requireAdmin(admin: SupabaseClient, request: Request): Promise<User> {
  const user = await getUser(admin, request)
  if (!user) throw new HttpError(401, 'UNAUTHORIZED', 'Please sign in again.')
  const { data } = await admin.from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle()
  if (!data) throw new HttpError(403, 'FORBIDDEN', 'Only admins can send marketing emails.')
  return user
}

async function loadEmail(admin: SupabaseClient, id: unknown): Promise<MarketingEmail> {
  const { data } = await admin.from('marketing_emails').select('*').eq('id', typeof id === 'string' ? id : '').maybeSingle()
  if (!data) throw new HttpError(404, 'NOT_FOUND', 'That email no longer exists.')
  return data as MarketingEmail
}

async function sendNow(admin: SupabaseClient, body: Record<string, unknown>) {
  const email = await loadEmail(admin, body.email_id)
  const ctx = await loadContext(admin)
  const { data: claimed } = await admin.from('marketing_emails').update({ status: 'sending', updated_at: new Date().toISOString() }).eq('id', email.id).in('status', ['draft', 'scheduled']).select('id')
  if (!claimed?.length) throw new HttpError(409, 'ALREADY_SENT', 'This email has already been sent or cancelled.')
  const recipients = resolveAudience(await loadCustomers(admin), email.audience, ctx.restaurant.timezone, await recentlyEmailed(admin, email.audience.skipRecentDays))
  const runId = await startRun(admin, email, 'one_off', recipients, (customer) => `e:${email.id}:${customer.user_id}`, true)
  const result = runId ? await processQueue(admin, ctx, Date.now() + 40_000, runId) : { sent: 0, failed: 0, firstError: null }
  if (runId) await finishRuns(admin, new Set([runId]))
  return { run_id: runId, recipients: recipients.length, ...result }
}

async function runNow(admin: SupabaseClient, body: Record<string, unknown>) {
  const email = await loadEmail(admin, body.email_id)
  if (email.mode !== 'automatic') throw new HttpError(400, 'BAD_REQUEST', 'Only automatic emails can be run now.')
  const ctx = await loadContext(admin)
  const period = periodKey(email.repeat_policy, zonedNow(ctx.restaurant.timezone).date)
  const recipients = resolveAudience(await loadCustomers(admin), email.audience, ctx.restaurant.timezone, await recentlyEmailed(admin, email.audience.skipRecentDays))
  const runId = await startRun(admin, email, 'automatic', recipients, (customer) => `a:${email.id}:${customer.user_id}:${period}`, false)
  await admin.from('marketing_emails').update({ last_run_at: new Date().toISOString() }).eq('id', email.id)
  if (!runId) return { run_id: null, recipients: 0, sent: 0, failed: 0, firstError: null }
  return { run_id: runId, recipients: recipients.length, ...(await processQueue(admin, ctx, Date.now() + 40_000, runId)) }
}

async function retryFailed(admin: SupabaseClient, body: Record<string, unknown>) {
  const runId = typeof body.run_id === 'string' ? body.run_id : ''
  const { data } = await admin.from('marketing_sends').update({ status: 'queued', attempts: 0 }).eq('run_id', runId).eq('status', 'failed').select('id')
  if (!data?.length) return { retried: 0, sent: 0, failed: 0, firstError: null }
  await admin.from('marketing_runs').update({ status: 'sending', finished_at: null }).eq('id', runId)
  const ctx = await loadContext(admin)
  return { retried: data.length, ...(await processQueue(admin, ctx, Date.now() + 40_000, runId)) }
}

async function sendTest(admin: SupabaseClient, user: User, body: Record<string, unknown>) {
  const message = body.message as EmailMessage | undefined
  if (!message?.subject?.trim() || !message.title?.trim()) throw new HttpError(400, 'INVALID_INPUT', 'Add a subject and a title first.')
  const ctx = await loadContext(admin)
  const saved = (ctx.settings.test_emails ?? '').split(/[\s,;]+/).map((value) => value.trim()).filter((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
  const recipients = saved.length ? saved.slice(0, 5) : user.email ? [user.email] : []
  if (!recipients.length) throw new HttpError(400, 'INVALID_INPUT', 'Add a test address in Settings first.')
  const { data: profile } = await admin.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
  const fullName = (profile as { full_name: string | null } | null)?.full_name ?? null
  const mailer = createMailer()
  const results: Array<{ to: string; ok: boolean; error?: string }> = []
  try {
    for (const to of recipients) {
      const email = renderEmail(message, { fullName, email: to }, await brandFor(ctx, null))
      try {
        await mailer.send({ fromName: ctx.settings.sender_name || ctx.restaurant.restaurant_name, to, replyTo: ctx.settings.reply_to || ctx.restaurant.restaurant_email, subject: `[Test] ${email.subject}`, html: email.html, text: email.text })
        results.push({ to, ok: true })
      } catch (error) {
        results.push({ to, ok: false, error: describeMailError(error).message })
      }
    }
  } finally {
    mailer.close()
  }
  return { results }
}

async function setSubscription(admin: SupabaseClient, body: Record<string, unknown>, optOut: boolean) {
  const userId = String(body.u ?? '')
  const token = typeof body.t === 'string' ? body.t : ''
  if (!/^[0-9a-f-]{36}$/i.test(userId) || (await sign(`unsub:${userId}`)) !== token) throw new HttpError(400, 'INVALID_LINK', 'This link is not valid.')
  const { error } = await admin.from('profiles').update({ marketing_opt_out: optOut }).eq('id', userId)
  if (error) throw new HttpError(500, 'DB', 'Could not update your email preferences. Please try again.')
  return { ok: true, subscribed: !optOut }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Use POST.')
    const body = await readJson(request)
    const admin = serviceClient()
    if (body.action === 'tick') return json(await tick(admin))
    if (body.action === 'unsubscribe' || body.action === 'resubscribe') return json(await setSubscription(admin, body, body.action === 'unsubscribe'))

    const user = await requireAdmin(admin, request)
    switch (body.action) {
      case 'send_now':
        return json(await sendNow(admin, body))
      case 'run_now':
        return json(await runNow(admin, body))
      case 'retry_failed':
        return json(await retryFailed(admin, body))
      case 'send_test':
        return json(await sendTest(admin, user, body))
      default:
        throw new HttpError(400, 'BAD_REQUEST', 'Unknown action.')
    }
  } catch (error) {
    if (error instanceof HttpError) return json({ error: { code: error.code, message: error.message } }, error.status)
    console.error('marketing-email: unhandled error', error)
    return json({ error: { code: 'INTERNAL', message: 'Something went wrong on our side. Please try again.' } }, 500)
  }
})
