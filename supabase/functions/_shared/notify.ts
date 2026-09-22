interface PaymentConfirmation {
  kind: 'order' | 'reservation'
  to: string
  restaurantName: string
  /** Order number for orders, or a human summary such as "Friday 24 May at 7:30 PM for 4" for reservations. */
  reference: string
}

/**
 * ==== CONFIRMATION EMAIL HOOK ====
 * Called by capture-checkout after a payment is captured. It intentionally does nothing yet.
 * To send emails, add a Resend (or similar) API key as a function secret and call it here, for example:
 *
 *   await fetch('https://api.resend.com/emails', {
 *     method: 'POST',
 *     headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
 *     body: JSON.stringify({ from: 'orders@your-domain.com', to: confirmation.to, subject: ..., html: ... }),
 *   })
 *
 * Failures here never fail the payment: capture-checkout catches and logs them.
 */
export async function sendConfirmationEmail(_confirmation: PaymentConfirmation): Promise<void> {}
