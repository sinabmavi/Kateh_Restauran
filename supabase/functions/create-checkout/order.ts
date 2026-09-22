import type { SupabaseClient, User } from 'npm:@supabase/supabase-js@2'
import { loadSettings } from '../_shared/booking.ts'
import { calculateDeliveryFee } from '../_shared/delivery.ts'
import { HttpError, email, integer, phone, text } from '../_shared/http.ts'
import { createPayPalOrder } from '../_shared/paypal.ts'
import { isPostcodeDeliverable, toCents } from '../_shared/rules.ts'
import type { OrderRow } from '../_shared/types.ts'

interface OrderItemInput {
  menu_item_id: string
  quantity: number
  notes: string
}

interface OrderInput {
  items: OrderItemInput[]
  orderType: 'delivery' | 'pickup'
  customer: { name: string; email: string; phone: string }
  address: { line: string; city: string; postcode: string; notes: string }
}

function parseOrder(body: Record<string, unknown>): OrderInput {
  const rawItems = body.items
  if (!Array.isArray(rawItems) || rawItems.length === 0 || rawItems.length > 60) throw new HttpError(400, 'INVALID_INPUT', 'Your basket is empty.')
  const items = rawItems.map((raw): OrderItemInput => {
    const item = (raw ?? {}) as Record<string, unknown>
    return {
      menu_item_id: text(item.menu_item_id, 'a dish', { min: 1, max: 64 }),
      quantity: integer(item.quantity, 'The quantity', 1, 50),
      notes: text(item.notes ?? '', 'the note', { max: 200 }),
    }
  })

  const orderType = body.order_type
  if (orderType !== 'delivery' && orderType !== 'pickup') throw new HttpError(400, 'INVALID_INPUT', 'Please choose delivery or pickup.')

  const customer = (body.customer ?? {}) as Record<string, unknown>
  const address = (body.address ?? {}) as Record<string, unknown>
  const delivery = orderType === 'delivery'
  return {
    items,
    orderType,
    customer: { name: text(customer.name, 'your name', { min: 2, max: 120 }), email: email(customer.email), phone: phone(customer.phone) },
    address: {
      line: text(address.line ?? '', 'your street address', { min: delivery ? 3 : 0, max: 200 }),
      city: text(address.city ?? '', 'your city', { min: delivery ? 2 : 0, max: 100 }),
      postcode: text(address.postcode ?? '', 'your postcode', { min: delivery ? 3 : 0, max: 20 }),
      notes: text(address.notes ?? '', 'delivery notes', { max: 300 }),
    },
  }
}

/** Creates a `pending_payment` order with prices computed from the database, plus the matching PayPal order. */
export async function createOrderCheckout(admin: SupabaseClient, user: User | null, body: Record<string, unknown>) {
  if (!user) throw new HttpError(401, 'AUTH_REQUIRED', 'Please sign in to place an order.')
  const input = parseOrder(body)
  const settings = await loadSettings(admin)

  if (!settings.ordering_enabled) throw new HttpError(403, 'ORDERING_PAUSED', 'Online ordering is paused right now. Please try again soon.')
  if (input.orderType === 'delivery' && !settings.delivery_enabled) throw new HttpError(403, 'DELIVERY_OFF', 'Delivery is unavailable right now. Please choose pickup.')
  if (input.orderType === 'pickup' && !settings.pickup_enabled) throw new HttpError(403, 'PICKUP_OFF', 'Pickup is unavailable right now. Please choose delivery.')
  if (input.orderType === 'delivery' && !isPostcodeDeliverable(input.address.postcode, settings.delivery_postcodes)) {
    throw new HttpError(422, 'OUTSIDE_AREA', 'Sorry, we do not deliver to that postcode. Please choose pickup instead.')
  }

  // Prices always come from the database, never from the browser.
  const ids = [...new Set(input.items.map((item) => item.menu_item_id))]
  const { data: menu, error: menuError } = await admin.from('menu_items').select('id, name, price, is_active').in('id', ids)
  if (menuError) throw new HttpError(500, 'DB', 'We could not load the menu. Please try again.')
  const byId = new Map((menu ?? []).map((row: { id: string; name: string; price: number; is_active: boolean }) => [row.id, row]))

  const lines = input.items.map((item) => {
    const dish = byId.get(item.menu_item_id)
    if (!dish || !dish.is_active || !(Number(dish.price) > 0)) {
      throw new HttpError(422, 'ITEM_UNAVAILABLE', `${dish?.name ?? 'One of the dishes in your basket'} is no longer available. Please review your basket.`)
    }
    const unitCents = toCents(dish.price)
    return { menu_item_id: dish.id, name: dish.name, unitCents, quantity: item.quantity, notes: item.notes, lineCents: unitCents * item.quantity }
  })

  const subtotalCents = lines.reduce((sum, line) => sum + line.lineCents, 0)
  if (subtotalCents < toCents(settings.min_order_amount)) {
    throw new HttpError(422, 'BELOW_MINIMUM', `The minimum order is ${(toCents(settings.min_order_amount) / 100).toFixed(2)} ${settings.currency}.`)
  }
  const feeCents = input.orderType === 'delivery' ? calculateDeliveryFee({ settings, address: input.address, subtotalCents }) : 0
  const totalCents = subtotalCents + feeCents
  const delivery = input.orderType === 'delivery'

  const { data: order, error: orderError } = await admin
    .from('orders')
    .insert({
      user_id: user.id,
      customer_name: input.customer.name,
      customer_email: input.customer.email,
      customer_phone: input.customer.phone,
      order_type: input.orderType,
      address_line: delivery ? input.address.line : null,
      city: delivery ? input.address.city : null,
      postcode: delivery ? input.address.postcode : null,
      delivery_notes: delivery ? input.address.notes || null : null,
      subtotal: subtotalCents / 100,
      delivery_fee: feeCents / 100,
      total: totalCents / 100,
      currency: settings.currency,
      status: 'pending_payment',
      payment_status: 'unpaid',
    })
    .select('id, order_number')
    .single()
  if (orderError || !order) {
    console.error('Order insert failed', orderError)
    throw new HttpError(500, 'DB', 'We could not save your order. Please try again.')
  }
  const created = order as Pick<OrderRow, 'id' | 'order_number'>

  const { error: itemsError } = await admin.from('order_items').insert(
    lines.map((line) => ({
      order_id: created.id,
      menu_item_id: line.menu_item_id,
      name: line.name,
      unit_price: line.unitCents / 100,
      quantity: line.quantity,
      notes: line.notes || null,
      line_total: line.lineCents / 100,
    })),
  )
  if (itemsError) {
    console.error('Order items insert failed', itemsError)
    await admin.from('orders').delete().eq('id', created.id)
    throw new HttpError(500, 'DB', 'We could not save your order. Please try again.')
  }

  let paypalOrderId: string
  try {
    paypalOrderId = (
      await createPayPalOrder({
        amountCents: totalCents,
        currency: settings.currency,
        customId: created.id,
        description: `${settings.restaurant_name} order #${created.order_number}`,
        requestId: `order-${created.id}`,
      })
    ).id
  } catch (error) {
    // Nothing was charged and the order never became payable, so remove it rather than leave debris.
    await admin.from('order_items').delete().eq('order_id', created.id)
    await admin.from('orders').delete().eq('id', created.id)
    throw error
  }

  const { error: paymentError } = await admin.from('payments').insert({
    kind: 'order',
    order_id: created.id,
    user_id: user.id,
    provider: 'paypal',
    paypal_order_id: paypalOrderId,
    amount: totalCents / 100,
    currency: settings.currency,
    status: 'created',
  })
  if (paymentError) {
    console.error('Payment insert failed', paymentError)
    throw new HttpError(500, 'DB', 'We could not start the payment. Please try again.')
  }

  return { kind: 'order', orderId: created.id, paypalOrderId }
}
