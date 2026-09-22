import { useMemo, useState } from 'react'
import { addMinutes, differenceInMinutes, format, parseISO } from 'date-fns'
import { ArrowRight, Bike, Clock, Mail, MapPin, Phone, RefreshCw, ShoppingBag, StickyNote, Store, Timer } from 'lucide-react'
import { AdminPageHead } from '../../components/admin'
import { OrderStatusBadge, PaymentBadge } from '../../components/badges'
import { useNow } from '../../components/OrderTracker'
import { ConfirmDialog } from '../../components/ui/Sheet'
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/primitives'
import { useRequiredSettings } from '../../context/SettingsContext'
import { useToast } from '../../context/ToastContext'
import { errorMessage } from '../../lib/errors'
import { formatMoney, formatTimestamp, telHref, timeAgo } from '../../lib/format'
import { ALL_STATUSES, CLOSED_BAD, IN_PROGRESS, STATUS_LABEL, nextStatus, nextStatusLabel } from '../../lib/orderStatus'
import type { Order, OrderStatus } from '../../lib/types'
import { useAdminOrders } from './AdminOrdersContext'
import { DeclineSheet, PrepTimeSheet } from './OrderSheets'

type Filter = 'needs_action' | 'in_progress' | 'completed' | 'closed' | 'unpaid' | 'all'

const FILTERS: Array<{ id: Filter; label: string; match: (order: Order) => boolean }> = [
  { id: 'needs_action', label: 'Needs action', match: (order) => order.status === 'placed' },
  { id: 'in_progress', label: 'In progress', match: (order) => IN_PROGRESS.includes(order.status) },
  { id: 'completed', label: 'Completed', match: (order) => order.status === 'completed' },
  { id: 'closed', label: 'Cancelled / Rejected', match: (order) => CLOSED_BAD.includes(order.status) },
  { id: 'unpaid', label: 'Unpaid', match: (order) => order.status === 'pending_payment' },
  { id: 'all', label: 'All', match: () => true },
]

function RemainingTime({ readyAt }: { readyAt: string }) {
  const now = useNow(30_000)
  const target = parseISO(readyAt)
  const minutes = differenceInMinutes(target, new Date(now), { roundingMethod: 'ceil' })
  return (
    <p className="ocard__eta">
      <Timer size={16} />
      <span>
        Ready by <strong>{format(target, 'h:mm a')}</strong> ·{' '}
        {minutes > 0 ? `${minutes} min left` : <span className="ocard__late">{Math.abs(minutes)} min overdue</span>}
      </span>
    </p>
  )
}

interface OrderCardProps {
  order: Order
  items: Array<{ id: string; name: string; quantity: number; notes: string | null; line_total: number }>
  fresh: boolean
  busy: boolean
  onSeen: () => void
  onAccept: () => void
  onDecline: () => void
  onAdvance: () => void
  onAdjust: () => void
  onSetStatus: (status: OrderStatus) => void
}

function OrderCard({ order, items, fresh, busy, onSeen, onAccept, onDecline, onAdvance, onAdjust, onSetStatus }: OrderCardProps) {
  const currency = order.currency
  const next = nextStatus(order)
  const canAdjust = ['accepted', 'preparing', 'ready'].includes(order.status)

  return (
    <article className={`ocard${fresh ? ' is-fresh' : ''}${order.status === 'placed' ? ' is-action' : ''}`} onClick={onSeen}>
      <header className="ocard__head">
        <div>
          <h3 className="ocard__num">
            #{String(order.order_number)}
            {fresh && <span className="badge badge--danger ocard__new">NEW ORDER</span>}
          </h3>
          <p className="ocard__time">
            {formatTimestamp(order.created_at, 'h:mm a')} · {timeAgo(order.created_at)}
          </p>
        </div>
        <div className="ocard__badges">
          <OrderStatusBadge status={order.status} type={order.order_type} />
          <PaymentBadge status={order.payment_status} />
          <span className="badge badge--dark">
            {order.order_type === 'delivery' ? <Bike size={13} /> : <Store size={13} />}
            {order.order_type === 'delivery' ? 'Delivery' : 'Pickup'}
          </span>
        </div>
      </header>

      <div className="ocard__cols">
        <div className="ocard__block">
          <strong>{order.customer_name}</strong>
          <a href={telHref(order.customer_phone)} className="ocard__link">
            <Phone size={15} /> {order.customer_phone}
          </a>
          <a href={`mailto:${order.customer_email}`} className="ocard__link">
            <Mail size={15} /> {order.customer_email}
          </a>
        </div>
        <div className="ocard__block">
          {order.order_type === 'delivery' ? (
            <>
              <span className="ocard__label">
                <MapPin size={14} /> Deliver to
              </span>
              <span>{order.address_line}</span>
              <span>{[order.city, order.postcode].filter(Boolean).join(', ')}</span>
              {order.delivery_notes && <em className="ocard__notes">“{order.delivery_notes}”</em>}
            </>
          ) : (
            <>
              <span className="ocard__label">
                <Store size={14} /> Pickup
              </span>
              <span>Customer collects from the restaurant</span>
            </>
          )}
        </div>
      </div>

      <ul className="ocard__items">
        {items.map((item) => (
          <li key={item.id}>
            <span className="ocard__qty">{item.quantity}×</span>
            <span className="ocard__name">
              {item.name}
              {item.notes && (
                <em>
                  <StickyNote size={12} /> {item.notes}
                </em>
              )}
            </span>
            <span className="ocard__price">{formatMoney(item.line_total, currency)}</span>
          </li>
        ))}
      </ul>

      <dl className="ocard__totals">
        <div>
          <dt>Subtotal</dt>
          <dd>{formatMoney(order.subtotal, currency)}</dd>
        </div>
        <div>
          <dt>Delivery</dt>
          <dd>{order.delivery_fee > 0 ? formatMoney(order.delivery_fee, currency) : 'Free'}</dd>
        </div>
        <div className="ocard__grand">
          <dt>Total</dt>
          <dd>{formatMoney(order.total, currency)}</dd>
        </div>
      </dl>

      {order.admin_note && (
        <p className="ocard__adminnote">
          <StickyNote size={15} /> {order.admin_note}
        </p>
      )}
      {order.estimated_ready_at && ['accepted', 'preparing', 'ready'].includes(order.status) && <RemainingTime readyAt={order.estimated_ready_at} />}
      {order.status === 'pending_payment' && (
        <p className="ocard__adminnote">
          <Clock size={15} /> Waiting for the customer to finish paying with PayPal. This is not an order yet.
        </p>
      )}

      <footer className="ocard__actions">
        {order.status === 'placed' && (
          <>
            <button type="button" className="btn btn--gold btn--lg ocard__accept" disabled={busy} onClick={onAccept}>
              Accept order
            </button>
            <button type="button" className="btn btn--danger-ghost btn--lg" disabled={busy} onClick={onDecline}>
              Decline
            </button>
          </>
        )}
        {next && (
          <button type="button" className="btn btn--dark btn--lg ocard__accept" disabled={busy} onClick={onAdvance}>
            {nextStatusLabel(order)} <ArrowRight size={17} />
          </button>
        )}
        {canAdjust && (
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={onAdjust}>
            <Timer size={16} /> Adjust time
          </button>
        )}
        <label className="ocard__status">
          <span className="visually-hidden">Set status</span>
          <select className="select select--sm" value={order.status} disabled={busy} onChange={(event) => onSetStatus(event.target.value as OrderStatus)}>
            {ALL_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </label>
      </footer>
    </article>
  )
}

export default function OrdersPage() {
  const settings = useRequiredSettings()
  const toast = useToast()
  const { orders, items, loading, error, freshIds, acknowledge, reload, updateOrder } = useAdminOrders()
  const [filter, setFilter] = useState<Filter>('needs_action')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [accept, setAccept] = useState<{ order: Order; mode: 'accept' | 'adjust' } | null>(null)
  const [decline, setDecline] = useState<Order | null>(null)
  const [cancelling, setCancelling] = useState<Order | null>(null)

  const counts = useMemo(() => Object.fromEntries(FILTERS.map((entry) => [entry.id, orders.filter(entry.match).length])) as Record<Filter, number>, [orders])

  const visible = useMemo(() => {
    const active = FILTERS.find((entry) => entry.id === filter) ?? FILTERS[0]
    const list = orders.filter(active.match)
    // Work through new orders oldest-first; everything else newest-first.
    return filter === 'needs_action' ? [...list].reverse() : list
  }, [orders, filter])

  const run = async (order: Order, action: () => Promise<void>, success?: string) => {
    setBusyId(order.id)
    try {
      await action()
      if (success) toast.success(success)
      setAccept(null)
      setDecline(null)
      setCancelling(null)
    } catch (failure) {
      toast.error(errorMessage(failure))
    } finally {
      setBusyId(null)
    }
  }

  const confirmPrep = (minutes: number, note: string) => {
    if (!accept) return
    const { order, mode } = accept
    const now = new Date()
    const readyAt = addMinutes(now, minutes).toISOString()
    if (mode === 'accept') {
      void run(
        order,
        () =>
          updateOrder(
            order.id,
            { status: 'accepted', accepted_at: now.toISOString(), estimated_minutes: minutes, estimated_ready_at: readyAt, admin_note: note.trim() || order.admin_note },
            ['placed'],
          ),
        `Order #${order.order_number} accepted`,
      )
    } else {
      void run(order, () => updateOrder(order.id, { estimated_minutes: minutes, estimated_ready_at: readyAt }, ['accepted', 'preparing', 'ready']), 'Preparation time updated')
    }
  }

  const setStatus = (order: Order, status: OrderStatus) => {
    if (status === order.status) return
    if (status === 'accepted') return setAccept({ order, mode: 'accept' })
    if (status === 'rejected') return setDecline(order)
    if (status === 'cancelled') return setCancelling(order)
    void run(order, () => updateOrder(order.id, { status }), `Order #${order.order_number}: ${STATUS_LABEL[status]}`)
  }

  const advance = (order: Order) => {
    const target = nextStatus(order)
    if (target) void run(order, () => updateOrder(order.id, { status: target }, [order.status]), `Order #${order.order_number}: ${STATUS_LABEL[target]}`)
  }

  return (
    <>
      <AdminPageHead
        title="Orders"
        subtitle="New orders appear here instantly. Accept, prepare and complete them in a few taps."
        actions={
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => void reload()}>
            <RefreshCw size={15} /> Refresh
          </button>
        }
      />

      <div className="filters" role="tablist" aria-label="Order filters">
        {FILTERS.map((entry) => (
          <button key={entry.id} type="button" role="tab" aria-selected={filter === entry.id} className={`chip${filter === entry.id ? ' is-active' : ''}`} onClick={() => setFilter(entry.id)}>
            {entry.label}
            {counts[entry.id] > 0 && <span className={`chip__count${entry.id === 'needs_action' ? '' : ' chip__count--quiet'}`}>{counts[entry.id]}</span>}
          </button>
        ))}
      </div>

      {error && orders.length === 0 ? (
        <ErrorState message={error} onRetry={() => void reload()} />
      ) : loading ? (
        <div className="ogrid">
          {Array.from({ length: 2 }, (_, index) => (
            <Skeleton key={index} style={{ height: 320, borderRadius: 22 }} />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<ShoppingBag size={28} />}
          title={filter === 'needs_action' ? 'No orders waiting' : 'Nothing here'}
          text={filter === 'needs_action' ? 'You are all caught up. New paid orders appear here the moment they arrive.' : 'No orders match this filter.'}
          action={
            filter === 'needs_action' && counts.in_progress > 0 ? (
              <button type="button" className="btn btn--dark" onClick={() => setFilter('in_progress')}>
                View {counts.in_progress} in progress
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="ogrid">
          {visible.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              items={items.get(order.id) ?? []}
              fresh={freshIds.has(order.id)}
              busy={busyId === order.id}
              onSeen={() => acknowledge(order.id)}
              onAccept={() => setAccept({ order, mode: 'accept' })}
              onDecline={() => setDecline(order)}
              onAdvance={() => advance(order)}
              onAdjust={() => setAccept({ order, mode: 'adjust' })}
              onSetStatus={(status) => setStatus(order, status)}
            />
          ))}
        </div>
      )}

      <PrepTimeSheet order={accept?.order ?? null} mode={accept?.mode ?? 'accept'} defaultMinutes={settings.default_prep_minutes || 20} busy={busyId !== null} onClose={() => setAccept(null)} onConfirm={confirmPrep} />

      <DeclineSheet
        order={decline}
        busy={busyId !== null}
        onClose={() => setDecline(null)}
        onConfirm={(reason) => decline && void run(decline, () => updateOrder(decline.id, { status: 'rejected', admin_note: reason }), `Order #${decline.order_number} declined`)}
      />

      <ConfirmDialog
        open={Boolean(cancelling)}
        danger
        title={`Cancel order #${cancelling?.order_number ?? ''}?`}
        confirmLabel="Cancel order"
        busy={busyId !== null}
        message={
          cancelling?.payment_status === 'paid' ? (
            <p>
              The customer has <strong>already paid</strong>. Cancelling does not refund them automatically. Please issue the refund from your PayPal dashboard.
            </p>
          ) : (
            <p>The customer will see that their order was cancelled.</p>
          )
        }
        onCancel={() => setCancelling(null)}
        onConfirm={() => cancelling && void run(cancelling, () => updateOrder(cancelling.id, { status: 'cancelled' }), `Order #${cancelling.order_number} cancelled`)}
      />
    </>
  )
}
