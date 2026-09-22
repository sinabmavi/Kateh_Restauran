// capture-checkout: captures an approved PayPal payment, verifies it against what we stored, and only then
// moves the order (placed) or reservation (confirmed) forward. Safe to call repeatedly.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { reactivateReservation } from '../_shared/booking.ts'
import { getUser, serviceClient } from '../_shared/clients.ts'
import { HttpError, handle, json, readJson } from '../_shared/http.ts'
import { sendConfirmationEmail } from '../_shared/notify.ts'
import { capturePayPalOrder } from '../_shared/paypal.ts'
import { toCents } from '../_shared/rules.ts'
import type { OrderRow, PaymentRow, ReservationRow } from '../_shared/types.ts'

interface CaptureResult {
  kind: 'order' | 'reservation'
  orderId?: string
  reservationId?: string
  captureStatus: 'completed' | 'pending'
  reservationStatus?: ReservationRow['status']
  needsRefund: boolean
  message?: string
}

const REFUND_MESSAGE =
  'Your payment reached us after your table hold expired, and the table has since been taken. Your deposit will be refunded to your PayPal account.'

const DEAD_ORDER_STATUSES = ['cancelled', 'rejected']

function reference(payment: PaymentRow): Pick<CaptureResult, 'kind' | 'orderId' | 'reservationId'> {
  return { kind: payment.kind, orderId: payment.order_id ?? undefined, reservationId: payment.reservation_id ?? undefined }
}

function reservationResult(payment: PaymentRow, status: ReservationRow['status'] | undefined, needsRefund: boolean): CaptureResult {
  return { ...reference(payment), captureStatus: 'completed', reservationStatus: status, needsRefund, message: needsRefund ? REFUND_MESSAGE : undefined }
}

/** Describes where a completed payment ended up without changing anything. Used for repeated calls. */
async function describe(admin: SupabaseClient, payment: PaymentRow): Promise<CaptureResult> {
  if (payment.kind === 'order') {
    const { data } = await admin.from('orders').select('status').eq('id', payment.order_id ?? '').maybeSingle()
    const order = data as Pick<OrderRow, 'status'> | null
    return { ...reference(payment), captureStatus: 'completed', needsRefund: order ? DEAD_ORDER_STATUSES.includes(order.status) : false }
  }
  const { data } = await admin.from('reservations').select('status').eq('id', payment.reservation_id ?? '').maybeSingle()
  const reservation = data as Pick<ReservationRow, 'status'> | null
  return reservationResult(payment, reservation?.status, reservation?.status === 'cancelled')
}

async function settleOrder(admin: SupabaseClient, payment: PaymentRow): Promise<CaptureResult> {
  const orderId = payment.order_id ?? ''
  const { data } = await admin.from('orders').select('status').eq('id', orderId).single()
  const order = data as Pick<OrderRow, 'status'>

  if (order.status === 'pending_payment') {
    const { error } = await admin.from('orders').update({ status: 'placed', payment_status: 'paid' }).eq('id', orderId).eq('status', 'pending_payment')
    if (error) throw new HttpError(500, 'DB', 'Your payment went through but we could not update your order. Please contact the restaurant.')
    return { ...reference(payment), captureStatus: 'completed', needsRefund: false }
  }

  // Cancelled or declined before the payment landed: record the payment; the admin sees it as "Needs refund".
  await admin.from('orders').update({ payment_status: 'paid' }).eq('id', orderId)
  return { ...reference(payment), captureStatus: 'completed', needsRefund: DEAD_ORDER_STATUSES.includes(order.status) }
}

async function settleReservation(admin: SupabaseClient, payment: PaymentRow): Promise<CaptureResult> {
  const reservationId = payment.reservation_id ?? ''

  // Two passes: if the status changes between reading and updating (for example expiry ran a moment ago), re-read once.
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data } = await admin.from('reservations').select('*').eq('id', reservationId).single()
    const reservation = data as ReservationRow

    if (reservation.status === 'pending') {
      const { data: updated } = await admin.from('reservations').update({ status: 'confirmed', payment_status: 'paid' }).eq('id', reservationId).eq('status', 'pending').select('id')
      if (updated && updated.length > 0) return reservationResult(payment, 'confirmed', false)
      continue
    }

    if (reservation.status === 'cancelled') {
      // Late payment: the hold expired (or was cancelled). Try to bring the booking back before giving up.
      if (await reactivateReservation(admin, reservation)) return reservationResult(payment, 'confirmed', false)
      // Keep the money on record as paid so the admin sees "Needs refund"; the reservation stays cancelled.
      await admin.from('reservations').update({ payment_status: 'paid' }).eq('id', reservationId)
      return reservationResult(payment, 'cancelled', true)
    }

    await admin.from('reservations').update({ payment_status: 'paid' }).eq('id', reservationId)
    return reservationResult(payment, reservation.status, false)
  }
  return reservationResult(payment, 'cancelled', true)
}

Deno.serve(
  handle(async (request) => {
    const body = await readJson(request)
    const paypalOrderId = typeof body.paypalOrderId === 'string' ? body.paypalOrderId.trim() : ''
    if (!/^[A-Za-z0-9_-]{5,64}$/.test(paypalOrderId)) throw new HttpError(400, 'BAD_REQUEST', 'Missing payment reference.')

    const admin = serviceClient()
    const user = await getUser(admin, request)

    const { data, error } = await admin.from('payments').select('*').eq('paypal_order_id', paypalOrderId).maybeSingle()
    if (error) throw new HttpError(500, 'DB', 'We could not look up your payment. Please try again.')
    const payment = data as PaymentRow | null
    if (!payment) throw new HttpError(404, 'UNKNOWN_PAYMENT', 'We could not find that payment.')
    // A payment tied to an account can only be completed by that account.
    if (payment.user_id && payment.user_id !== user?.id) throw new HttpError(403, 'FORBIDDEN', 'That payment belongs to a different account.')

    // Idempotent: a repeated call reports the current outcome and never double-processes.
    if (payment.status === 'completed' || payment.status === 'refunded') return json(await describe(admin, payment))

    const captured = await capturePayPalOrder(paypalOrderId)
    const capture = captured.purchase_units?.[0]?.payments?.captures?.[0]

    // A PayPal risk review leaves the capture pending. Nothing is confirmed until the money is actually captured.
    if (captured.status !== 'COMPLETED' || !capture || capture.status === 'PENDING') {
      return json({ ...reference(payment), captureStatus: 'pending', needsRefund: false } satisfies CaptureResult)
    }
    if (capture.status !== 'COMPLETED') {
      await admin.from('payments').update({ status: 'failed', raw: captured }).eq('id', payment.id).eq('status', 'created')
      throw new HttpError(402, 'PAYMENT_DECLINED', 'PayPal did not complete that payment. You have not been charged.')
    }

    const amountMatches = toCents(capture.amount.value) === toCents(payment.amount) && capture.amount.currency_code === payment.currency
    if (!amountMatches) {
      await admin.from('payments').update({ status: 'failed', paypal_capture_id: capture.id, raw: captured }).eq('id', payment.id).eq('status', 'created')
      console.error('Captured payment did not match', { paypalOrderId, capture, expected: { amount: payment.amount, currency: payment.currency } })
      throw new HttpError(409, 'AMOUNT_MISMATCH', 'The payment did not match the order, so it was not accepted. Please contact the restaurant.')
    }

    const payerName = [captured.payer?.name?.given_name, captured.payer?.name?.surname].filter(Boolean).join(' ') || null
    // Only one concurrent request can win this claim; the loser just reports the outcome.
    const { data: claimed } = await admin
      .from('payments')
      .update({
        status: 'completed',
        paypal_capture_id: capture.id,
        payer_email: captured.payer?.email_address ?? null,
        payer_name: payerName,
        raw: captured,
        captured_at: new Date().toISOString(),
      })
      .eq('id', payment.id)
      .eq('status', 'created')
      .select('id')
    if (!claimed || claimed.length === 0) return json(await describe(admin, payment))

    const result = payment.kind === 'order' ? await settleOrder(admin, payment) : await settleReservation(admin, payment)

    const to = captured.payer?.email_address
    if (!result.needsRefund && to) {
      const { data: settings } = await admin.from('restaurant_settings').select('restaurant_name').limit(1).maybeSingle()
      await sendConfirmationEmail({
        kind: payment.kind,
        to,
        restaurantName: (settings as { restaurant_name: string } | null)?.restaurant_name ?? '',
        reference: result.orderId ?? result.reservationId ?? '',
      }).catch((failure) => console.error('Confirmation email failed', failure))
    }

    return json(result)
  }),
)
