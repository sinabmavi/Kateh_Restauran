import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Bike, MessageSquare, ShoppingBag, Store, Trash2 } from 'lucide-react'
import { EmptyState, QuantityStepper } from '../components/ui/primitives'
import { SmartImage } from '../components/ui/SmartImage'
import { useCart, type CartLine } from '../context/CartContext'
import { useRequiredSettings } from '../context/SettingsContext'
import { useDocumentMeta } from '../hooks/useDocumentMeta'
import { useMenuItems } from '../hooks/useMenuItems'
import { categoryGroup } from '../lib/categories'
import { formatMoney, pluralise } from '../lib/format'
import { categoryImages } from '../lib/images'
import { toCents } from '../../supabase/functions/_shared/rules'

function CartLineRow({ line, currency }: { line: CartLine; currency: string }) {
  const { setQuantity, setNotes, remove } = useCart()
  const [editing, setEditing] = useState(false)

  return (
    <li className="cart-line card">
      <div className="cart-line__thumb">
        <SmartImage src={line.imageUrl} fallbackSrc={categoryImages[categoryGroup(line.category)]} alt={line.name} width={120} />
      </div>
      <div className="cart-line__main">
        <div className="cart-line__top">
          <h3 className="cart-line__name">{line.name}</h3>
          <span className="cart-line__total">{formatMoney((toCents(line.price) * line.quantity) / 100, currency)}</span>
        </div>
        <p className="cart-line__unit">{formatMoney(line.price, currency)} each</p>

        {editing ? (
          <input
            className="input cart-line__note-input"
            aria-label={`Special requests for ${line.name}`}
            placeholder="e.g. medium-rare, no onions"
            maxLength={200}
            value={line.notes}
            autoFocus
            onChange={(event) => setNotes(line.lineId, event.target.value)}
            onBlur={() => setEditing(false)}
            onKeyDown={(event) => event.key === 'Enter' && setEditing(false)}
          />
        ) : (
          <button type="button" className="cart-line__note" onClick={() => setEditing(true)}>
            <MessageSquare size={14} />
            {line.notes ? line.notes : 'Add a note'}
          </button>
        )}

        <div className="cart-line__actions">
          <QuantityStepper value={line.quantity} min={0} onChange={(value) => setQuantity(line.lineId, value)} label={`${line.name} quantity`} />
          <button type="button" className="cart-line__remove" onClick={() => remove(line.lineId)} aria-label={`Remove ${line.name}`}>
            <Trash2 size={18} />
          </button>
        </div>
      </div>
    </li>
  )
}

export default function CartPage() {
  const settings = useRequiredSettings()
  const { lines, count, subtotal, orderType, setOrderType } = useCart()
  useMenuItems()
  useDocumentMeta('Your order')

  // Keep the chosen order type valid when the restaurant turns delivery or pickup off.
  useEffect(() => {
    if (orderType === 'delivery' && !settings.delivery_enabled && settings.pickup_enabled) setOrderType('pickup')
    if (orderType === 'pickup' && !settings.pickup_enabled && settings.delivery_enabled) setOrderType('delivery')
  }, [orderType, settings.delivery_enabled, settings.pickup_enabled, setOrderType])

  if (lines.length === 0) {
    return (
      <div className="container page">
        <EmptyState
          icon={<ShoppingBag size={30} />}
          title="Your basket is empty"
          text="Add something delicious from the menu and it will appear here."
          action={
            <Link to="/menu" className="btn btn--gold">
              Browse the menu <ArrowRight size={17} />
            </Link>
          }
        />
      </div>
    )
  }

  const serviceAvailable = orderType === 'delivery' ? settings.delivery_enabled : settings.pickup_enabled
  const fee = orderType === 'delivery' ? settings.delivery_fee : 0
  const total = (toCents(subtotal) + toCents(fee)) / 100
  const belowMinimum = subtotal < settings.min_order_amount
  const blocked = !settings.ordering_enabled || !serviceAvailable || belowMinimum

  let reason = ''
  if (!settings.ordering_enabled) reason = 'Online ordering is paused right now. Please check back soon.'
  else if (!settings.delivery_enabled && !settings.pickup_enabled) reason = 'Delivery and pickup are both unavailable at the moment.'
  else if (!serviceAvailable) reason = `${orderType === 'delivery' ? 'Delivery' : 'Pickup'} is unavailable right now. Please choose the other option.`
  else if (belowMinimum) reason = `The minimum order is ${formatMoney(settings.min_order_amount, settings.currency)}. Add ${formatMoney(settings.min_order_amount - subtotal, settings.currency)} more to continue.`

  return (
    <div className="container page cart-page">
      <header className="page__head">
        <div>
          <h1 className="page__title">Your order</h1>
          <p className="page__lede">{pluralise(count, 'item')} in your basket</p>
        </div>
      </header>

      <div className="cart-page__grid">
        <ul className="cart-lines">
          {lines.map((line) => (
            <CartLineRow key={line.lineId} line={line} currency={settings.currency} />
          ))}
        </ul>

        <aside className="cart-summary card card--pad">
          <div className="segmented cart-summary__toggle" role="group" aria-label="Order type">
            <button type="button" className="segmented__option" aria-pressed={orderType === 'delivery'} disabled={!settings.delivery_enabled} onClick={() => setOrderType('delivery')}>
              <Bike size={18} /> Delivery
            </button>
            <button type="button" className="segmented__option" aria-pressed={orderType === 'pickup'} disabled={!settings.pickup_enabled} onClick={() => setOrderType('pickup')}>
              <Store size={18} /> Pickup
            </button>
          </div>

          <dl className="totals">
            <div>
              <dt>Subtotal</dt>
              <dd>{formatMoney(subtotal, settings.currency)}</dd>
            </div>
            {orderType === 'delivery' && (
              <div>
                <dt>Delivery</dt>
                <dd>{fee > 0 ? formatMoney(fee, settings.currency) : 'Free'}</dd>
              </div>
            )}
            <div className="totals__grand">
              <dt>Total</dt>
              <dd>{formatMoney(total, settings.currency)}</dd>
            </div>
          </dl>

          {reason && (
            <div className="notice notice--info" role="status">
              {reason}
            </div>
          )}

          {blocked ? (
            <button type="button" className="btn btn--gold btn--lg btn--block" disabled>
              Checkout
            </button>
          ) : (
            <Link to="/checkout" className="btn btn--gold btn--lg btn--block">
              Checkout · {formatMoney(total, settings.currency)}
            </Link>
          )}
          <p className="cart-summary__secure">Secure payment with PayPal. You will be asked to sign in to place the order.</p>
        </aside>
      </div>
    </div>
  )
}
