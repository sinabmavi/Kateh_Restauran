import { statusLabel } from '../lib/orderStatus'
import { formatMoney } from '../lib/format'
import type { OrderPaymentStatus, OrderStatus, OrderType, PaymentStatus, ReservationPaymentStatus, ReservationStatus } from '../lib/types'

const ORDER_TONE: Record<OrderStatus, string> = {
  pending_payment: 'badge--warn',
  placed: 'badge--gold',
  accepted: 'badge--info',
  preparing: 'badge--info',
  ready: 'badge--info',
  out_for_delivery: 'badge--info',
  completed: 'badge--ok',
  cancelled: 'badge--danger',
  rejected: 'badge--danger',
}

export function OrderStatusBadge({ status, type }: { status: OrderStatus; type: OrderType }) {
  return <span className={`badge ${ORDER_TONE[status] ?? ''}`}>{statusLabel(status, type)}</span>
}

const RESERVATION_TONE: Record<ReservationStatus, string> = {
  pending: 'badge--warn',
  confirmed: 'badge--ok',
  cancelled: 'badge--danger',
  completed: '',
}

export function ReservationStatusBadge({ status }: { status: ReservationStatus }) {
  return <span className={`badge ${RESERVATION_TONE[status] ?? ''}`}>{status.charAt(0).toUpperCase() + status.slice(1)}</span>
}

interface PaymentBadgeProps {
  status: OrderPaymentStatus | ReservationPaymentStatus | PaymentStatus
  amount?: number | null
  currency?: string
}

const PAYMENT: Record<string, { label: string; tone: string }> = {
  paid: { label: 'Paid', tone: 'badge--ok' },
  completed: { label: 'Paid', tone: 'badge--ok' },
  unpaid: { label: 'Unpaid', tone: 'badge--warn' },
  created: { label: 'Not completed', tone: 'badge--warn' },
  failed: { label: 'Failed', tone: 'badge--danger' },
  refunded: { label: 'Refunded', tone: 'badge--info' },
  not_required: { label: 'No deposit', tone: '' },
}

export function PaymentBadge({ status, amount, currency }: PaymentBadgeProps) {
  const meta = PAYMENT[status] ?? { label: status, tone: '' }
  const showAmount = amount && amount > 0 && (status === 'paid' || status === 'unpaid')
  return (
    <span className={`badge ${meta.tone}`}>
      {meta.label}
      {showAmount ? ` · ${formatMoney(amount, currency)}` : ''}
    </span>
  )
}
