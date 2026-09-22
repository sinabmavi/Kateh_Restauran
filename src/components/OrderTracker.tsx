import { useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Ban, Check, ChefHat, CircleCheck, Clock, CookingPot, PackageCheck, Store, Truck, type LucideIcon } from 'lucide-react'
import { currentStepIndex, trackerSteps } from '../lib/orderStatus'
import type { Order, OrderStatus } from '../lib/types'

/** Re-renders every `intervalMs`; used for live countdowns without touching the rest of the page. */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs])
  return now
}

export function Countdown({ readyAt }: { readyAt: string }) {
  const now = useNow(1000)
  const target = parseISO(readyAt)
  const remaining = target.getTime() - now
  const minutes = Math.ceil(remaining / 60000)

  let text: string
  if (remaining <= 0) text = 'Any moment now'
  else if (remaining < 60000) text = 'Less than a minute'
  else text = `About ${minutes} min`

  return (
    <div className="countdown">
      <span className="countdown__label">{remaining > 0 ? 'Ready in' : 'Almost there'}</span>
      <span className="countdown__value" aria-live="off">
        {text}
      </span>
      <span className="countdown__at">around {format(target, 'h:mm a')}</span>
    </div>
  )
}

interface StatusMeta {
  icon: LucideIcon
  title: string
  message: string
}

export function statusMeta(order: Pick<Order, 'status' | 'order_type'>): StatusMeta {
  const pickup = order.order_type === 'pickup'
  const map: Record<OrderStatus, StatusMeta> = {
    pending_payment: { icon: Clock, title: 'Waiting for payment', message: 'We have not received your payment yet. If you have just paid, this page will update in a moment.' },
    placed: { icon: Clock, title: 'Order placed', message: 'Waiting for the restaurant to accept your order…' },
    accepted: { icon: CircleCheck, title: 'Order accepted', message: 'The kitchen has your order and will start on it shortly.' },
    preparing: { icon: CookingPot, title: 'Being prepared', message: 'Our chefs are cooking your order right now.' },
    ready: pickup
      ? { icon: Store, title: 'Ready for pickup', message: 'Your order is ready. Please come and collect it at the restaurant.' }
      : { icon: PackageCheck, title: 'Ready to go', message: 'Your order is packed and about to head out to you.' },
    out_for_delivery: { icon: Truck, title: 'On its way', message: 'Your order is out for delivery and will be with you soon.' },
    completed: pickup
      ? { icon: ChefHat, title: 'Picked up', message: 'Enjoy your meal. Thank you for ordering with us!' }
      : { icon: ChefHat, title: 'Delivered', message: 'Enjoy your meal. Thank you for ordering with us!' },
    cancelled: { icon: Ban, title: 'Order cancelled', message: '' },
    rejected: { icon: Ban, title: 'Order declined', message: '' },
  }
  return map[order.status]
}

export function OrderStepper({ order }: { order: Pick<Order, 'status' | 'order_type'> }) {
  const steps = trackerSteps(order.order_type)
  const current = currentStepIndex(order)
  const finished = order.status === 'completed'

  return (
    <ol className="stepper-track" aria-label="Order progress">
      {steps.map((step, index) => {
        const done = finished || index < current
        const active = !finished && index === current
        return (
          <li key={step.key} className={`stepper-track__step${done ? ' is-done' : ''}${active ? ' is-active' : ''}`} aria-current={active ? 'step' : undefined}>
            <span className="stepper-track__dot">{done ? <Check size={16} strokeWidth={3} /> : index + 1}</span>
            <span className="stepper-track__label">{step.label}</span>
          </li>
        )
      })}
    </ol>
  )
}
