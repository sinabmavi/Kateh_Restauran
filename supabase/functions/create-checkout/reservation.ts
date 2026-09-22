import type { SupabaseClient, User } from 'npm:@supabase/supabase-js@2'
import { holdReservation, parseReservationInput } from '../_shared/booking.ts'
import { HttpError } from '../_shared/http.ts'
import { createPayPalOrder } from '../_shared/paypal.ts'

/**
 * Books a table. Login is optional. Without a deposit the reservation is simply `pending`; with a deposit it is
 * held (`unpaid`) for 15 minutes while the guest pays, and `capture-checkout` confirms it.
 */
export async function createReservationCheckout(admin: SupabaseClient, user: User | null, body: Record<string, unknown>) {
  const input = parseReservationInput(body)
  const { reservation, depositCents, settings } = await holdReservation(admin, input, user?.id ?? null)

  if (depositCents <= 0) {
    return { kind: 'reservation', reservationId: reservation.id, requiresPayment: false, status: reservation.status }
  }

  let paypalOrderId: string
  try {
    paypalOrderId = (
      await createPayPalOrder({
        amountCents: depositCents,
        currency: settings.currency,
        customId: reservation.id,
        description: `${settings.restaurant_name} table deposit`,
        requestId: `reservation-${reservation.id}`,
      })
    ).id
  } catch (error) {
    // Release the table straight away instead of holding it for 15 minutes for a payment that cannot happen.
    await admin.from('reservations').update({ status: 'cancelled' }).eq('id', reservation.id)
    throw error
  }

  const { error } = await admin.from('payments').insert({
    kind: 'reservation',
    reservation_id: reservation.id,
    user_id: user?.id ?? null,
    provider: 'paypal',
    paypal_order_id: paypalOrderId,
    amount: depositCents / 100,
    currency: settings.currency,
    status: 'created',
  })
  if (error) {
    console.error('Payment insert failed', error)
    await admin.from('reservations').update({ status: 'cancelled' }).eq('id', reservation.id)
    throw new HttpError(500, 'DB', 'We could not start the payment. Please try again.')
  }

  return {
    kind: 'reservation',
    reservationId: reservation.id,
    requiresPayment: true,
    paypalOrderId,
    depositAmount: depositCents / 100,
    status: reservation.status,
  }
}
