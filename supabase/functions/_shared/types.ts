// Row shapes the Edge Functions read. They mirror the live database schema; nothing here changes it.

export interface Settings {
  id: string
  restaurant_name: string
  slot_interval_minutes: number
  booking_notice_hours: number
  default_reservation_duration_minutes: number
  max_party_size: number
  timezone: string
  currency: string
  ordering_enabled: boolean
  delivery_enabled: boolean
  pickup_enabled: boolean
  delivery_postcodes: string | null
  delivery_fee: number
  min_order_amount: number
  reservation_deposit_per_guest: number
}

export interface BusinessHoursRow {
  weekday: number
  is_open: boolean
  start_time: string
  end_time: string
}

export interface TableRow {
  id: string
  table_name: string
  capacity: number
}

export interface ReservationRow {
  id: string
  table_id: string
  party_size: number
  full_name: string
  email: string
  reservation_date: string
  start_time: string
  end_time: string
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed'
  payment_status: 'not_required' | 'unpaid' | 'paid' | 'refunded'
  deposit_amount: number | null
  created_at: string
}

export interface OrderRow {
  id: string
  order_number: number | string
  status: string
  payment_status: string
  customer_email: string
}

export interface PaymentRow {
  id: string
  kind: 'order' | 'reservation'
  order_id: string | null
  reservation_id: string | null
  user_id: string | null
  paypal_order_id: string
  amount: number
  currency: string
  status: 'created' | 'completed' | 'failed' | 'refunded'
}
