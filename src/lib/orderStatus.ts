import type { Order, OrderStatus, OrderType } from './types'

export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending_payment: 'Awaiting payment',
  placed: 'New order',
  accepted: 'Accepted',
  preparing: 'Preparing',
  ready: 'Ready',
  out_for_delivery: 'Out for delivery',
  completed: 'Completed',
  cancelled: 'Cancelled',
  rejected: 'Declined',
}

export const ALL_STATUSES: OrderStatus[] = [
  'pending_payment',
  'placed',
  'accepted',
  'preparing',
  'ready',
  'out_for_delivery',
  'completed',
  'cancelled',
  'rejected',
]

export const IN_PROGRESS: OrderStatus[] = ['accepted', 'preparing', 'ready', 'out_for_delivery']
export const CLOSED_BAD: OrderStatus[] = ['cancelled', 'rejected']

export function statusLabel(status: OrderStatus, type: OrderType): string {
  if (status === 'ready' && type === 'pickup') return 'Ready for pickup'
  return STATUS_LABEL[status]
}

/** The next step in the kitchen flow, or null when the order is finished or not yet acceptable. */
export function nextStatus(order: Pick<Order, 'status' | 'order_type'>): OrderStatus | null {
  switch (order.status) {
    case 'accepted':
      return 'preparing'
    case 'preparing':
      return 'ready'
    case 'ready':
      return order.order_type === 'delivery' ? 'out_for_delivery' : 'completed'
    case 'out_for_delivery':
      return 'completed'
    default:
      return null
  }
}

export function nextStatusLabel(order: Pick<Order, 'status' | 'order_type'>): string {
  const next = nextStatus(order)
  switch (next) {
    case 'preparing':
      return 'Start preparing'
    case 'ready':
      return order.order_type === 'pickup' ? 'Ready for pickup' : 'Mark ready'
    case 'out_for_delivery':
      return 'Out for delivery'
    case 'completed':
      return order.order_type === 'pickup' ? 'Picked up' : 'Mark delivered'
    default:
      return ''
  }
}

export interface TrackerStep {
  key: string
  label: string
  /** The order statuses that mean "this step is where the order is right now". */
  statuses: OrderStatus[]
}

export function trackerSteps(type: OrderType): TrackerStep[] {
  return [
    { key: 'placed', label: 'Order placed', statuses: ['placed'] },
    { key: 'accepted', label: 'Accepted', statuses: ['accepted'] },
    { key: 'preparing', label: 'Being prepared', statuses: ['preparing'] },
    type === 'pickup'
      ? { key: 'ready', label: 'Ready for pickup', statuses: ['ready'] }
      : { key: 'ready', label: 'Out for delivery', statuses: ['ready', 'out_for_delivery'] },
    { key: 'completed', label: 'Completed', statuses: ['completed'] },
  ]
}

/** Index of the step the order is currently on, or -1 if it has not entered the flow (or was cancelled). */
export function currentStepIndex(order: Pick<Order, 'status' | 'order_type'>): number {
  return trackerSteps(order.order_type).findIndex((step) => step.statuses.includes(order.status))
}
