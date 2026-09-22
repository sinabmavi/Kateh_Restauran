export type Id = string

export type ReservationStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed'
export type ReservationPaymentStatus = 'not_required' | 'unpaid' | 'paid' | 'refunded'
export type OrderType = 'delivery' | 'pickup'
export type OrderStatus =
  | 'pending_payment'
  | 'placed'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'out_for_delivery'
  | 'completed'
  | 'cancelled'
  | 'rejected'
export type OrderPaymentStatus = 'unpaid' | 'paid' | 'refunded'
export type PaymentKind = 'order' | 'reservation'
export type PaymentStatus = 'created' | 'completed' | 'failed' | 'refunded'

export interface RestaurantTable {
  id: Id
  table_name: string
  capacity: number
  area: string | null
  is_active: boolean
  created_at: string
}

export interface MenuItem {
  id: Id
  name: string
  description: string | null
  price: number
  category: string
  is_featured: boolean
  is_active: boolean
  image_url: string | null
  created_at: string
}

export interface Reservation {
  id: Id
  full_name: string
  email: string
  phone: string
  party_size: number
  table_id: Id
  reservation_date: string
  start_time: string
  end_time: string
  status: ReservationStatus
  special_requests: string | null
  user_id: Id | null
  deposit_amount: number | null
  payment_status: ReservationPaymentStatus
  created_at: string
}

export interface BusinessHours {
  id: Id
  weekday: number
  is_open: boolean
  start_time: string
  end_time: string
}

export interface BlockedDate {
  id: Id
  blocked_date: string
  reason: string | null
  created_at: string
}

export interface RestaurantSettings {
  id: Id
  restaurant_name: string
  restaurant_email: string | null
  restaurant_phone: string | null
  restaurant_address: string | null
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
  delivery_area_note: string | null
  delivery_fee: number
  min_order_amount: number
  default_prep_minutes: number
  reservation_deposit_per_guest: number
  created_at: string
}

export interface Profile {
  id: Id
  full_name: string | null
  phone: string | null
  address_line: string | null
  city: string | null
  postcode: string | null
  delivery_notes: string | null
  created_at: string
  updated_at: string
}

export interface Order {
  id: Id
  order_number: number | string
  user_id: Id | null
  customer_name: string
  customer_email: string
  customer_phone: string
  order_type: OrderType
  address_line: string | null
  city: string | null
  postcode: string | null
  delivery_notes: string | null
  subtotal: number
  delivery_fee: number
  total: number
  currency: string
  status: OrderStatus
  payment_status: OrderPaymentStatus
  estimated_minutes: number | null
  estimated_ready_at: string | null
  accepted_at: string | null
  admin_note: string | null
  created_at: string
  updated_at: string
}

export interface OrderItem {
  id: Id
  order_id: Id
  menu_item_id: Id | null
  name: string
  unit_price: number
  quantity: number
  notes: string | null
  line_total: number
}

export interface Payment {
  id: Id
  kind: PaymentKind
  order_id: Id | null
  reservation_id: Id | null
  user_id: Id | null
  provider: string
  paypal_order_id: string
  paypal_capture_id: string | null
  amount: number
  currency: string
  status: PaymentStatus
  payer_email: string | null
  payer_name: string | null
  raw: unknown
  created_at: string
  captured_at: string | null
}

export type AdminRole = 'admin' | 'super_admin'

export interface AdminAccount {
  user_id: Id
  full_name: string | null
  email: string | null
  role: AdminRole
  created_at: string
  last_sign_in_at: string | null
}

export interface AdminAccountInput {
  full_name: string
  email: string
  password: string
  role: AdminRole
}

export interface BusySlot {
  table_id: Id
  start_time: string
  end_time: string
}

/* ------------------------------------------------------- edge functions */

export interface CheckoutCustomer {
  name: string
  email: string
  phone: string
}

export interface CheckoutAddress {
  line: string
  city: string
  postcode: string
  notes: string
}

export interface OrderCheckoutRequest {
  kind: 'order'
  items: Array<{ menu_item_id: Id; quantity: number; notes: string }>
  order_type: OrderType
  customer: CheckoutCustomer
  address: CheckoutAddress
}

export interface ReservationCheckoutRequest {
  kind: 'reservation'
  full_name: string
  email: string
  phone: string
  party_size: number
  /** `yyyy-MM-dd` */
  date: string
  /** `HH:mm:ss` */
  start_time: string
  special_requests: string
}

export interface OrderCheckoutResponse {
  kind: 'order'
  orderId: Id
  paypalOrderId: string
}

export interface ReservationCheckoutResponse {
  kind: 'reservation'
  reservationId: Id
  requiresPayment: boolean
  paypalOrderId?: string
  depositAmount?: number
  status: ReservationStatus
}

export interface CaptureResponse {
  kind: PaymentKind
  orderId?: Id
  reservationId?: Id
  /** `completed` once money was captured, `pending` if PayPal is still reviewing the payment. */
  captureStatus: 'completed' | 'pending'
  reservationStatus?: ReservationStatus
  /** True when the payment succeeded but the order or table could not be honoured. */
  needsRefund: boolean
  message?: string
}
