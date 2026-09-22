import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Bike, Lock, MapPinOff, Store } from 'lucide-react'
import { PayPalCheckout } from '../components/PayPalCheckout'
import { Field } from '../components/ui/primitives'
import { SmartImage } from '../components/ui/SmartImage'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'
import { useRequiredSettings } from '../context/SettingsContext'
import { useToast } from '../context/ToastContext'
import { useDocumentMeta } from '../hooks/useDocumentMeta'
import { useMenuItems } from '../hooks/useMenuItems'
import { createOrderCheckout } from '../lib/api'
import { categoryGroup } from '../lib/categories'
import { formatMoney, isValidEmail, isValidPhone } from '../lib/format'
import { categoryImages } from '../lib/images'
import type { CaptureResponse } from '../lib/types'
import { isPostcodeDeliverable, toCents } from '../../supabase/functions/_shared/rules'

interface FormState {
  name: string
  email: string
  phone: string
  line: string
  city: string
  postcode: string
  notes: string
}

const EMPTY: FormState = { name: '', email: '', phone: '', line: '', city: '', postcode: '', notes: '' }

export default function CheckoutPage() {
  const settings = useRequiredSettings()
  const { user, profile, adminChecked, saveProfile } = useAuth()
  const { lines, subtotal, orderType, setOrderType, clear } = useCart()
  const navigate = useNavigate()
  const toast = useToast()
  useMenuItems()
  useDocumentMeta('Checkout')

  const [form, setForm] = useState<FormState>(EMPTY)
  const [touched, setTouched] = useState<Partial<Record<keyof FormState, boolean>>>({})
  const prefilled = useRef(false)
  const finished = useRef(false)

  // Prefill once the account (and its profile) has loaded. Never overwrite what the guest already typed.
  useEffect(() => {
    if (prefilled.current || !user || !adminChecked) return
    prefilled.current = true
    const meta = user.user_metadata as { full_name?: string; phone?: string } | undefined
    setForm((current) => ({
      name: current.name || profile?.full_name || meta?.full_name || '',
      email: current.email || user.email || '',
      phone: current.phone || profile?.phone || meta?.phone || '',
      line: current.line || profile?.address_line || '',
      city: current.city || profile?.city || '',
      postcode: current.postcode || profile?.postcode || '',
      notes: current.notes || profile?.delivery_notes || '',
    }))
  }, [user, profile, adminChecked])

  const isDelivery = orderType === 'delivery'
  const fee = isDelivery ? settings.delivery_fee : 0
  const total = (toCents(subtotal) + toCents(fee)) / 100

  const errors = useMemo(() => {
    const result: Partial<Record<keyof FormState, string>> = {}
    if (form.name.trim().length < 2) result.name = 'Please enter your full name.'
    if (!isValidEmail(form.email)) result.email = 'Please enter a valid email address.'
    if (!isValidPhone(form.phone)) result.phone = 'Please enter a phone number we can reach you on.'
    if (isDelivery) {
      if (form.line.trim().length < 3) result.line = 'Please enter your street address.'
      if (form.city.trim().length < 2) result.city = 'Please enter your city.'
      if (form.postcode.trim().length < 3) result.postcode = 'Please enter your postcode.'
    }
    return result
  }, [form, isDelivery])

  const outsideArea = isDelivery && form.postcode.trim().length >= 3 && !isPostcodeDeliverable(form.postcode, settings.delivery_postcodes)
  const serviceAvailable = isDelivery ? settings.delivery_enabled : settings.pickup_enabled
  const belowMinimum = subtotal < settings.min_order_amount
  const canPay = Object.keys(errors).length === 0 && !outsideArea && serviceAvailable && settings.ordering_enabled && !belowMinimum && lines.length > 0

  if (lines.length === 0) return finished.current ? null : <Navigate to="/cart" replace />

  const set = (key: keyof FormState) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value }))
  const blur = (key: keyof FormState) => () => setTouched((current) => ({ ...current, [key]: true }))
  const shown = (key: keyof FormState) => (touched[key] ? errors[key] : undefined)

  const createOrder = async () => {
    await saveProfile({
      full_name: form.name.trim(),
      phone: form.phone.trim(),
      ...(isDelivery ? { address_line: form.line.trim(), city: form.city.trim(), postcode: form.postcode.trim(), delivery_notes: form.notes.trim() } : {}),
    }).catch(() => undefined)

    const response = await createOrderCheckout({
      kind: 'order',
      items: lines.map((line) => ({ menu_item_id: line.menuItemId, quantity: line.quantity, notes: line.notes.trim() })),
      order_type: orderType,
      customer: { name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim() },
      address: isDelivery
        ? { line: form.line.trim(), city: form.city.trim(), postcode: form.postcode.trim(), notes: form.notes.trim() }
        : { line: '', city: '', postcode: '', notes: '' },
    })
    return response.paypalOrderId
  }

  const onCaptured = (result: CaptureResponse) => {
    finished.current = true
    if (result.captureStatus === 'pending') toast.info('PayPal is still reviewing your payment. We will start on your order as soon as it clears.')
    clear()
    navigate(`/order/${result.orderId}?paid=1`, { replace: true })
  }

  return (
    <div className="container page checkout">
      <header className="page__head">
        <div>
          <h1 className="page__title">Checkout</h1>
          <p className="page__lede">
            <Link to="/cart" className="link">
              Back to your basket
            </Link>
          </p>
        </div>
      </header>

      <div className="checkout__grid">
        <div className="checkout__forms">
          <div className="segmented checkout__toggle" role="group" aria-label="Order type">
            <button type="button" className="segmented__option" aria-pressed={isDelivery} disabled={!settings.delivery_enabled} onClick={() => setOrderType('delivery')}>
              <Bike size={18} /> Delivery
            </button>
            <button type="button" className="segmented__option" aria-pressed={!isDelivery} disabled={!settings.pickup_enabled} onClick={() => setOrderType('pickup')}>
              <Store size={18} /> Pickup
            </button>
          </div>

          <section className="card card--pad checkout__section">
            <h2 className="checkout__h">Your details</h2>
            <div className="form-grid form-grid--2">
              <Field label="Full name" htmlFor="co-name" error={shown('name')}>
                <input id="co-name" className="input" autoComplete="name" value={form.name} onChange={set('name')} onBlur={blur('name')} aria-invalid={Boolean(shown('name'))} />
              </Field>
              <Field label="Phone" htmlFor="co-phone" error={shown('phone')}>
                <input id="co-phone" className="input" type="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} onBlur={blur('phone')} aria-invalid={Boolean(shown('phone'))} />
              </Field>
            </div>
            <Field label="Email" htmlFor="co-email" hint="We send your order confirmation here." error={shown('email')}>
              <input id="co-email" className="input" type="email" autoComplete="email" value={form.email} onChange={set('email')} onBlur={blur('email')} aria-invalid={Boolean(shown('email'))} />
            </Field>
          </section>

          {isDelivery ? (
            <section className="card card--pad checkout__section">
              <h2 className="checkout__h">Delivery address</h2>
              <Field label="Street address" htmlFor="co-line" error={shown('line')}>
                <input id="co-line" className="input" autoComplete="street-address" value={form.line} onChange={set('line')} onBlur={blur('line')} aria-invalid={Boolean(shown('line'))} />
              </Field>
              <div className="form-grid form-grid--2">
                <Field label="City" htmlFor="co-city" error={shown('city')}>
                  <input id="co-city" className="input" autoComplete="address-level2" value={form.city} onChange={set('city')} onBlur={blur('city')} aria-invalid={Boolean(shown('city'))} />
                </Field>
                <Field label="Postcode" htmlFor="co-postcode" error={shown('postcode')}>
                  <input id="co-postcode" className="input" autoComplete="postal-code" value={form.postcode} onChange={set('postcode')} onBlur={blur('postcode')} aria-invalid={Boolean(shown('postcode'))} />
                </Field>
              </div>
              <Field label="Delivery notes" htmlFor="co-notes" hint="For example: ring the bell twice.">
                <textarea id="co-notes" className="textarea" maxLength={300} value={form.notes} onChange={set('notes')} placeholder="Anything the driver should know" />
              </Field>
              {settings.delivery_area_note && !outsideArea && <p className="field__hint">{settings.delivery_area_note}</p>}
              {outsideArea && (
                <div className="notice notice--danger" role="alert">
                  <MapPinOff size={18} />
                  <div className="notice__body">
                    <strong>Sorry, we do not deliver to that postcode yet.</strong>
                    {settings.delivery_area_note && <span>{settings.delivery_area_note}</span>}
                    {settings.pickup_enabled && (
                      <button type="button" className="btn btn--dark btn--sm" onClick={() => setOrderType('pickup')}>
                        <Store size={16} /> Switch to pickup
                      </button>
                    )}
                  </div>
                </div>
              )}
            </section>
          ) : (
            <section className="card card--pad checkout__section">
              <h2 className="checkout__h">Pickup</h2>
              <p className="muted-note">
                Collect your order from <strong>{settings.restaurant_address ?? settings.restaurant_name}</strong>. We will show you when it is ready.
              </p>
            </section>
          )}
        </div>

        <aside className="checkout__summary card card--pad">
          <h2 className="checkout__h">Order summary</h2>
          <ul className="summary-lines">
            {lines.map((line) => (
              <li key={line.lineId} className="summary-line">
                <span className="summary-line__thumb">
                  <SmartImage src={line.imageUrl} fallbackSrc={categoryImages[categoryGroup(line.category)]} alt="" width={56} />
                </span>
                <span className="summary-line__text">
                  <strong>
                    {line.quantity} × {line.name}
                  </strong>
                  {line.notes && <em>{line.notes}</em>}
                </span>
                <span>{formatMoney((toCents(line.price) * line.quantity) / 100, settings.currency)}</span>
              </li>
            ))}
          </ul>
          <dl className="totals">
            <div>
              <dt>Subtotal</dt>
              <dd>{formatMoney(subtotal, settings.currency)}</dd>
            </div>
            {isDelivery && (
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

          {!settings.ordering_enabled && <div className="notice notice--info">Online ordering is paused right now. Please try again shortly.</div>}
          {settings.ordering_enabled && !serviceAvailable && <div className="notice notice--info">{isDelivery ? 'Delivery' : 'Pickup'} is unavailable right now. Please choose the other option.</div>}
          {belowMinimum && <div className="notice notice--info">The minimum order is {formatMoney(settings.min_order_amount, settings.currency)}.</div>}
          {!canPay && Object.keys(errors).length > 0 && settings.ordering_enabled && !belowMinimum && !outsideArea && (
            <p className="checkout__hint">Complete your details above to enable payment.</p>
          )}

          <PayPalCheckout currency={settings.currency} disabled={!canPay} createOrder={createOrder} onCaptured={onCaptured} />
          <p className="checkout__secure">
            <Lock size={14} /> Payments are processed securely by PayPal.
          </p>
        </aside>
      </div>
    </div>
  )
}
