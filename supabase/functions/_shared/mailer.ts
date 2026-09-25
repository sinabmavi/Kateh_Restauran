// Sends email from info@kateh.io through the restaurant's Hostinger mailbox, using the same settings and
// secrets (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM) as the reservation emails.
import nodemailer from 'npm:nodemailer@6.9.16'
import { HttpError } from './http.ts'

export interface OutgoingEmail {
  fromName: string
  to: string
  toName?: string | null
  replyTo?: string | null
  subject: string
  html: string
  text: string
  headers?: Record<string, string>
}

export function senderAddress(): string {
  return Deno.env.get('EMAIL_FROM') || Deno.env.get('SMTP_USER') || 'info@kateh.io'
}

export function createMailer() {
  const user = Deno.env.get('SMTP_USER')
  const pass = Deno.env.get('SMTP_PASS')
  if (!user || !pass) throw new HttpError(500, 'NOT_CONFIGURED', 'Email is not set up: the SMTP_PASS secret is missing in Supabase.')
  const port = Number(Deno.env.get('SMTP_PORT') || 465)
  const transport = nodemailer.createTransport({
    host: Deno.env.get('SMTP_HOST') || 'smtp.hostinger.com',
    port,
    secure: port === 465,
    auth: { user, pass },
  })

  return {
    async send(email: OutgoingEmail): Promise<string> {
      const from = senderAddress()
      const info = await transport.sendMail({
        from: { name: email.fromName, address: from },
        to: email.toName ? { name: email.toName, address: email.to } : email.to,
        replyTo: email.replyTo || from,
        subject: email.subject,
        html: email.html,
        text: email.text,
        headers: email.headers,
      })
      return String(info.response ?? 'accepted')
    },
    close() {
      transport.close()
    },
  }
}

/** Plain-language explanation of an SMTP failure, and whether it is worth retrying. */
export function describeMailError(error: unknown): { message: string; temporary: boolean } {
  const failure = error as { responseCode?: number; code?: string; response?: string; message?: string }
  const code = failure?.responseCode
  const raw = (failure?.response || failure?.message || String(error)).slice(0, 300)
  if (failure?.code === 'EAUTH' || code === 535) return { message: `The mailbox login was refused. Check the SMTP_PASS secret. (${raw})`, temporary: false }
  if (code && code >= 500) return { message: `The address was rejected by the mail server. (${raw})`, temporary: false }
  if (code && code >= 400) return { message: `The mail server asked to try later. (${raw})`, temporary: true }
  if (failure?.code && /ECONN|ETIMEDOUT|ESOCKET|EDNS/.test(failure.code)) return { message: `Could not reach the mail server. (${raw})`, temporary: true }
  return { message: raw, temporary: true }
}
