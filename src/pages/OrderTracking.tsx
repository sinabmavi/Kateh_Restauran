import { useCallback, useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Check, Mail, MapPin, Phone, ReceiptText, Store } from 'lucide-react'
import { PaymentBadge } from '../components/badges'
import { Countdown, OrderStepper, statusMeta } from '../components/OrderTracker'
import { EmptyState, ErrorState, PageLoading } from '../components/ui/primitives'
import { useRequiredSettings } from '../context/SettingsContext'
import { useDocumentMeta } from '../hooks/useDocumentMeta'
import { fetchOrderItems, normaliseOrder } from '../lib/data'
import { errorMessage, unwrap } from '../lib/errors'
import { formatMoney, formatTimestamp, telHref } from '../lib/format'
import { supabase } from '../lib/supabase'
import type { Order, OrderItem } from '../lib/types'

const POLL_MS = 10_000
const LIVE_STATUSES = ['accepted', 'preparing', 'ready']

export default function OrderTrackingPage() {
  const { id } = useParams()
  const settings = useRequiredSettings()
  const [params] = useSearchParams()
  const [order, setOrder] = useState<Order | null>(null)
  const [items, setItems] = useState<OrderItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [celebrate, setCelebrate] = useState(params.get('paid') === '1')
  useDocumentMeta(order ? `Order #${order.order_number}` : 'Your order')

  const load = useCallback(async () => {
    if (!id) return
    try {
      const row = unwrap<Order | null>(await supabase.from('orders').select('*').eq('id', id).maybeSingle())
      setOrder(row ? normaliseOrder(row) : null)
      if (row) setItems((await fetchOrderItems([row.id])).get(row.id) ?? [])
      setError(null)
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  // Realtime: the admin changing the status (or the prep time) updates this page instantly.
  useEffect(() => {
    if (!id) return
    const channel = supabase
      .channel(`order-${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${id}` }, (payload) => {
        setOrder((current) => normaliseOrder({ ...(current ?? {}), ...(payload.new as Order) }))
      })
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [id])

  // Fallback in case the socket silently drops.
  useEffect(() => {
    const timer = window.setInterval(() => void load(), POLL_MS)
    return () => window.clearInterval(timer)
  }, [load])

  useEffect(() => {
    if (!celebrate) return
    const timer = window.setTimeout(() => setCelebrate(false), 2800)
    return () => window.clearTimeout(timer)
  }, [celebrate])

  if (loading) return <PageLoading />
  if (error && !order) return <div className="container page"><ErrorState message={error} onRetry={() => void load()} /></div>
  if (!order) {
    return (
      <div className="container page">
        <EmptyState
          icon={<ReceiptText size={28} />}
          title="We could not find that order"
          text="It may belong to a different account. Sign in with the email you ordered with."
          action={
            <Link to="/account" className="btn btn--dark">
              Go to my account
            </Link>
          }
        />
      </div>
    )
  }

  const meta = statusMeta(order)
  const Icon = meta.icon
  const failed = order.status === 'cancelled' || order.status === 'rejected'
  const showCountdown = LIVE_STATUSES.includes(order.status) && Boolean(order.estimated_ready_at)
  const currency = order.currency || settings.currency

  return (
    <div className="container page tracking">
      {celebrate && (
        <div className="pay-success" role="status" aria-live="polite">
          <div className="pay-success__ring">
            <Check size={44} strokeWidth={3} />
          </div>
          <p>Payment received. Thank you!</p>
        </div>
      )}

      <header className="page__head tracking__head">
        <div>
          <p className="section-head__eyebrow">{order.order_type === 'delivery' ? 'Delivery' : 'Pickup'} order</p>
          <h1 className="page__title">Order #{String(order.order_number)}</h1>
          <p className="page__lede">Placed {formatTimestamp(order.created_at, "d MMM 'at' h:mm a")}</p>
        </div>
        <PaymentBadge status={order.payment_status} />
      </header>

      <div className="tracking__grid">
        <div className="tracking__main">
          <section className={`status-card${failed ? ' status-card--failed' : ''}`} aria-live="polite">
            <span className="status-card__icon">
              <Icon size={30} />
            </span>
            <div className="status-card__text">
              <h2 className="status-card__title">{meta.title}</h2>
              {failed ? (
                <div className="status-card__failed">
                  <p>
                    {order.status === 'rejected'
                      ? 'We are sorry, the restaurant could not take this order.'
                      : 'This order was cancelled.'}
                  </p>
                  {order.admin_note && <p className="status-card__reason">“{order.admin_note}”</p>}
                  {order.payment_status === 'paid' && <p>Your PayPal payment will be refunded. If you have not seen it within a few days, please get in touch and quote your order number.</p>}
                  <div className="status-card__contact">
                    {settings.restaurant_phone && (
                      <a href={telHref(settings.restaurant_phone)}>
                        <Phone size={16} /> {settings.restaurant_phone}
                      </a>
                    )}
                    {settings.restaurant_email && (
                      <a href={`mailto:${settings.restaurant_email}`}>
                        <Mail size={16} /> {settings.restaurant_email}
                      </a>
                    )}
                  </div>
                </div>
              ) : (
                <p className="status-card__message">{meta.message}</p>
              )}
              {showCountdown && order.estimated_ready_at && <Countdown readyAt={order.estimated_ready_at} />}
            </div>
          </section>

          {!failed && order.status !== 'pending_payment' && (
            <section className="card card--pad tracking__steps">
              <OrderStepper order={order} />
            </section>
          )}
        </div>

        <div className="tracking__side">
          <section className="card card--pad">
            <h2 className="checkout__h">Your order</h2>
            <ul className="summary-lines">
              {items.map((item) => (
                <li key={item.id} className="summary-line summary-line--plain">
                  <span className="summary-line__text">
                    <strong>
                      {item.quantity} × {item.name}
                    </strong>
                    {item.notes && <em>{item.notes}</em>}
                  </span>
                  <span>{formatMoney(item.line_total, currency)}</span>
                </li>
              ))}
            </ul>
            <dl className="totals">
              <div>
                <dt>Subtotal</dt>
                <dd>{formatMoney(order.subtotal, currency)}</dd>
              </div>
              {order.order_type === 'delivery' && (
                <div>
                  <dt>Delivery</dt>
                  <dd>{order.delivery_fee > 0 ? formatMoney(order.delivery_fee, currency) : 'Free'}</dd>
                </div>
              )}
              <div className="totals__grand">
                <dt>Total</dt>
                <dd>{formatMoney(order.total, currency)}</dd>
              </div>
            </dl>
          </section>

          <section className="card card--pad tracking__where">
            {order.order_type === 'delivery' ? (
              <>
                <h2 className="checkout__h">
                  <MapPin size={18} /> Delivering to
                </h2>
                <p>
                  {order.address_line}
                  <br />
                  {[order.city, order.postcode].filter(Boolean).join(', ')}
                </p>
                {order.delivery_notes && <p className="muted-note">Notes: {order.delivery_notes}</p>}
              </>
            ) : (
              <>
                <h2 className="checkout__h">
                  <Store size={18} /> Pickup from
                </h2>
                <p>{settings.restaurant_address ?? settings.restaurant_name}</p>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
