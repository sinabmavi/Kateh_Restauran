import { HttpError } from './http.ts'
import { centsToDecimal } from './rules.ts'

// PayPal REST API v2. The secret only ever exists here, in Supabase Edge Function secrets:
//   PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_ENV ('sandbox' | 'live')

export interface PayPalCapture {
  id: string
  status: string
  amount: { currency_code: string; value: string }
}

export interface PayPalOrder {
  id: string
  status: string
  payer?: { email_address?: string; name?: { given_name?: string; surname?: string } }
  purchase_units?: Array<{
    custom_id?: string
    reference_id?: string
    payments?: { captures?: PayPalCapture[] }
  }>
}

interface PayPalIssue {
  issue?: string
  description?: string
}

function baseUrl(): string {
  return Deno.env.get('PAYPAL_ENV') === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com'
}

let cachedToken: { value: string; expiresAt: number } | null = null

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.value
  const id = Deno.env.get('PAYPAL_CLIENT_ID')
  const secret = Deno.env.get('PAYPAL_CLIENT_SECRET')
  if (!id || !secret) throw new HttpError(500, 'MISCONFIGURED', 'Payments are not configured yet. Please contact the restaurant.')

  const response = await fetch(`${baseUrl()}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${id}:${secret}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  })
  if (!response.ok) {
    console.error('PayPal auth failed', response.status, await response.text())
    throw new HttpError(502, 'PAYPAL_AUTH', 'We could not reach PayPal. Please try again in a moment.')
  }
  const body = await response.json()
  cachedToken = { value: body.access_token, expiresAt: Date.now() + Number(body.expires_in ?? 300) * 1000 }
  return cachedToken.value
}

async function paypal(path: string, init: { method: string; body?: unknown; requestId?: string }): Promise<{ status: number; body: any }> {
  const token = await accessToken()
  const response = await fetch(`${baseUrl()}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.requestId ? { 'PayPal-Request-Id': init.requestId } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  const body = await response.json().catch(() => ({}))
  return { status: response.status, body }
}

function issueOf(body: { details?: PayPalIssue[] }): string {
  return body.details?.[0]?.issue ?? ''
}

interface CreateOrderInput {
  amountCents: number
  currency: string
  /** Our own id (order or reservation) stored in PayPal's `custom_id`. */
  customId: string
  description: string
  /** Makes retries idempotent on PayPal's side. */
  requestId: string
}

export async function createPayPalOrder(input: CreateOrderInput): Promise<PayPalOrder> {
  const { status, body } = await paypal('/v2/checkout/orders', {
    method: 'POST',
    requestId: input.requestId,
    body: {
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: input.customId,
          custom_id: input.customId,
          description: input.description.slice(0, 120),
          amount: { currency_code: input.currency, value: centsToDecimal(input.amountCents) },
        },
      ],
    },
  })
  if (status >= 400 || !body.id) {
    console.error('PayPal create order failed', status, JSON.stringify(body))
    throw new HttpError(502, 'PAYPAL_CREATE', 'We could not start the payment with PayPal. Please try again.')
  }
  return body as PayPalOrder
}

export async function getPayPalOrder(paypalOrderId: string): Promise<PayPalOrder> {
  const { status, body } = await paypal(`/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`, { method: 'GET' })
  if (status >= 400) {
    console.error('PayPal get order failed', status, JSON.stringify(body))
    throw new HttpError(502, 'PAYPAL_LOOKUP', 'We could not check the payment with PayPal. Please try again.')
  }
  return body as PayPalOrder
}

/** Captures an approved order. If it was already captured (a repeated call), returns the existing capture instead. */
export async function capturePayPalOrder(paypalOrderId: string): Promise<PayPalOrder> {
  const { status, body } = await paypal(`/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`, {
    method: 'POST',
    requestId: `capture-${paypalOrderId}`,
    body: {},
  })
  if (status < 400) return body as PayPalOrder

  const issue = issueOf(body)
  if (issue === 'ORDER_ALREADY_CAPTURED') return getPayPalOrder(paypalOrderId)
  console.error('PayPal capture failed', status, JSON.stringify(body))
  if (issue === 'ORDER_NOT_APPROVED') throw new HttpError(409, 'NOT_APPROVED', 'The payment has not been approved in PayPal yet.')
  if (issue === 'INSTRUMENT_DECLINED' || issue === 'PAYER_ACTION_REQUIRED') {
    throw new HttpError(402, 'PAYMENT_DECLINED', 'PayPal declined that payment method. Please try another one.')
  }
  throw new HttpError(502, 'PAYPAL_CAPTURE', 'We could not complete the payment with PayPal. You have not been charged.')
}
