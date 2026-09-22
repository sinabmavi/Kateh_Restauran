import type { Settings } from './types.ts'

interface DeliveryFeeInput {
  settings: Settings
  address: { line: string; city: string; postcode: string }
  subtotalCents: number
}

/**
 * ==== DELIVERY PRICING HOOK ====
 * Returns the delivery fee in cents. Today it is the flat `restaurant_settings.delivery_fee` (currently 0, i.e. free).
 * Every total in create-checkout already flows through this function, so automatic distance-based pricing
 * (geocode the address, price per km, free above a threshold, ...) can be added here without touching checkout.
 */
export function calculateDeliveryFee({ settings }: DeliveryFeeInput): number {
  return Math.round(Number(settings.delivery_fee ?? 0) * 100)
}
