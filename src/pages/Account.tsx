import { useMemo, useState, type FormEvent } from 'react'
import { addMinutes, startOfDay } from 'date-fns'
import { Link, useNavigate } from 'react-router-dom'
import { CalendarDays, CalendarPlus, LogOut, RotateCcw, ShoppingBag } from 'lucide-react'
import { OrderStatusBadge, PaymentBadge, ReservationStatusBadge } from '../components/badges'
import { EmptyState, ErrorState, Field, Skeleton } from '../components/ui/primitives'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'
import { useRequiredSettings } from '../context/SettingsContext'
import { useToast } from '../context/ToastContext'
import { useAsync } from '../hooks/useAsync'
import { useDocumentMeta } from '../hooks/useDocumentMeta'
import { fetchActiveMenuItems, fetchOrderItems, normaliseOrder } from '../lib/data'
import { errorMessage, unwrap } from '../lib/errors'
import { formatDateOnly, formatMoney, formatTimeOfDay, formatTimestamp, isValidBirthday, isValidPhone, parseDateOnly, pluralise } from '../lib/format'
import { buildIcs, downloadIcs } from '../lib/ics'
import { isOrderable } from '../lib/categories'
import { supabase } from '../lib/supabase'
import { parseTimeToMinutes } from '../../supabase/functions/_shared/rules'
import type { Order, OrderItem, Reservation } from '../lib/types'

type Tab = 'orders' | 'reservations' | 'profile'

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'orders', label: 'My orders' },
  { id: 'reservations', label: 'My reservations' },
  { id: 'profile', label: 'Profile' },
]

const FRESH_UNPAID_MS = 30 * 60 * 1000

function OrdersTab() {
  const { user } = useAuth()
  const settings = useRequiredSettings()
  const { replaceLines, setOrderType } = useCart()
  const toast = useToast()
  const navigate = useNavigate()
  const [reordering, setReordering] = useState<string | null>(null)

  const state = useAsync(async () => {
    const orders = unwrap<Order[]>(await supabase.from('orders').select('*').eq('user_id', user!.id).order('created_at', { ascending: false }).limit(60)).map(normaliseOrder)
    const visible = orders.filter((order) => order.status !== 'pending_payment' || Date.now() - new Date(order.created_at).getTime() < FRESH_UNPAID_MS)
    return { orders: visible, items: await fetchOrderItems(visible.map((order) => order.id)) }
  }, [user?.id])

  const reorder = async (order: Order, items: OrderItem[]) => {
    setReordering(order.id)
    try {
      const menu = await fetchActiveMenuItems()
      const byId = new Map(menu.map((item) => [item.id, item]))
      const available: Array<{ item: (typeof menu)[number]; quantity: number; notes: string }> = []
      const missing: string[] = []
      for (const line of items) {
        const item = line.menu_item_id ? byId.get(line.menu_item_id) : undefined
        if (item && isOrderable(item)) available.push({ item, quantity: line.quantity, notes: line.notes ?? '' })
        else missing.push(line.name)
      }
      if (available.length === 0) {
        toast.error('None of those dishes are available right now.')
        return
      }
      replaceLines(available)
      setOrderType(order.order_type)
      if (missing.length) toast.info(`Not available right now and left out: ${missing.join(', ')}`)
      navigate('/cart')
    } catch (failure) {
      toast.error(errorMessage(failure))
    } finally {
      setReordering(null)
    }
  }

  if (state.error) return <ErrorState message={state.error} onRetry={state.reload} />
  if (!state.data) return <Skeleton style={{ height: 120 }} />
  if (state.data.orders.length === 0) {
    return (
      <EmptyState
        icon={<ShoppingBag size={28} />}
        title="No orders yet"
        text="When you place an order it will appear here so you can track it or order it again."
        action={
          <Link to="/menu" className="btn btn--gold">
            Browse the menu
          </Link>
        }
      />
    )
  }

  return (
    <ul className="list">
      {state.data.orders.map((order) => {
        const items = state.data!.items.get(order.id) ?? []
        return (
          <li key={order.id} className="list__item card card--pad">
            <div className="list__head">
              <div>
                <Link to={`/order/${order.id}`} className="list__title">
                  Order #{String(order.order_number)}
                </Link>
                <p className="list__meta">
                  {formatTimestamp(order.created_at)} · {order.order_type === 'delivery' ? 'Delivery' : 'Pickup'}
                </p>
              </div>
              <OrderStatusBadge status={order.status} type={order.order_type} />
            </div>
            <p className="list__body">{items.map((item) => `${item.quantity}× ${item.name}`).join(', ') || pluralise(items.length, 'item')}</p>
            <div className="list__foot">
              <strong>{formatMoney(order.total, order.currency || settings.currency)}</strong>
              <div className="list__actions">
                <Link to={`/order/${order.id}`} className="btn btn--ghost btn--sm">
                  {order.status === 'pending_payment' ? 'View' : 'Track'}
                </Link>
                {items.length > 0 && (
                  <button type="button" className="btn btn--soft btn--sm" disabled={reordering === order.id} onClick={() => void reorder(order, items)}>
                    <RotateCcw size={15} /> Reorder
                  </button>
                )}
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function ReservationsTab() {
  const { user } = useAuth()
  const settings = useRequiredSettings()

  const state = useAsync(
    async () => unwrap<Reservation[]>(await supabase.from('reservations').select('*').eq('user_id', user!.id).order('reservation_date', { ascending: false }).order('start_time', { ascending: false })),
    [user?.id],
  )

  const addToCalendar = (reservation: Reservation) => {
    const day = startOfDay(parseDateOnly(reservation.reservation_date))
    const start = addMinutes(day, parseTimeToMinutes(reservation.start_time) ?? 0)
    const end = addMinutes(day, parseTimeToMinutes(reservation.end_time) ?? 0)
    downloadIcs(
      'reservation.ics',
      buildIcs({
        uid: reservation.id,
        title: `Dinner at ${settings.restaurant_name}`,
        description: `Table for ${reservation.party_size}.`,
        location: settings.restaurant_address ?? settings.restaurant_name,
        start,
        end,
        timezone: settings.timezone,
      }),
    )
  }

  if (state.error) return <ErrorState message={state.error} onRetry={state.reload} />
  if (!state.data) return <Skeleton style={{ height: 120 }} />
  if (state.data.length === 0) {
    return (
      <EmptyState
        icon={<CalendarDays size={28} />}
        title="No reservations yet"
        text="Book a table while signed in and it will show up here."
        action={
          <Link to="/reserve" className="btn btn--gold">
            Reserve a table
          </Link>
        }
      />
    )
  }

  return (
    <ul className="list">
      {state.data.map((reservation) => (
        <li key={reservation.id} className="list__item card card--pad">
          <div className="list__head">
            <div>
              <p className="list__title">{formatDateOnly(reservation.reservation_date)}</p>
              <p className="list__meta">
                {formatTimeOfDay(reservation.start_time)} · Table for {reservation.party_size}
              </p>
            </div>
            <ReservationStatusBadge status={reservation.status} />
          </div>
          {reservation.special_requests && <p className="list__body">“{reservation.special_requests}”</p>}
          <div className="list__foot">
            <PaymentBadge status={reservation.payment_status} amount={reservation.deposit_amount} currency={settings.currency} />
            {reservation.status !== 'cancelled' && (
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => addToCalendar(reservation)}>
                <CalendarPlus size={15} /> Add to calendar
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}

function ProfileTab() {
  const { user, profile, saveProfile } = useAuth()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    full_name: profile?.full_name ?? '',
    phone: profile?.phone ?? '',
    address_line: profile?.address_line ?? '',
    city: profile?.city ?? '',
    postcode: profile?.postcode ?? '',
    delivery_notes: profile?.delivery_notes ?? '',
    birthday: profile?.birthday ?? '',
  })
  // Only offered once the database has the column (after 09_customer_club.sql), so saving never fails before that.
  const supportsBirthday = Boolean(profile && 'birthday' in profile)
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value }))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (form.full_name.trim().length < 2) return toast.error('Please enter your full name.')
    if (form.phone.trim() && !isValidPhone(form.phone)) return toast.error('That phone number does not look right.')
    if (form.birthday && !isValidBirthday(form.birthday)) return toast.error('That date of birth does not look right.')
    setBusy(true)
    try {
      await saveProfile({
        full_name: form.full_name.trim(),
        phone: form.phone.trim(),
        address_line: form.address_line.trim(),
        city: form.city.trim(),
        postcode: form.postcode.trim(),
        delivery_notes: form.delivery_notes.trim(),
        ...(supportsBirthday ? { birthday: form.birthday || null } : {}),
      })
      toast.success('Your profile has been saved.')
    } catch (failure) {
      toast.error(errorMessage(failure))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card card--pad form-grid" onSubmit={submit}>
      <Field label="Email" htmlFor="pf-email" hint="Your sign-in email cannot be changed here.">
        <input id="pf-email" className="input" value={user?.email ?? ''} disabled />
      </Field>
      <div className="form-grid form-grid--2">
        <Field label="Full name" htmlFor="pf-name">
          <input id="pf-name" className="input" autoComplete="name" value={form.full_name} onChange={set('full_name')} />
        </Field>
        <Field label="Phone" htmlFor="pf-phone">
          <input id="pf-phone" className="input" type="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} />
        </Field>
      </div>
      {supportsBirthday && (
        <Field label="Date of birth" htmlFor="pf-birthday" hint="We like to send a little treat on your birthday.">
          <input id="pf-birthday" className="input" type="date" autoComplete="bday" min="1900-01-01" max={new Date().toISOString().slice(0, 10)} value={form.birthday} onChange={set('birthday')} />
        </Field>
      )}
      <h3 className="checkout__h">Default delivery address</h3>
      <Field label="Street address" htmlFor="pf-line">
        <input id="pf-line" className="input" autoComplete="street-address" value={form.address_line} onChange={set('address_line')} />
      </Field>
      <div className="form-grid form-grid--2">
        <Field label="City" htmlFor="pf-city">
          <input id="pf-city" className="input" autoComplete="address-level2" value={form.city} onChange={set('city')} />
        </Field>
        <Field label="Postcode" htmlFor="pf-postcode">
          <input id="pf-postcode" className="input" autoComplete="postal-code" value={form.postcode} onChange={set('postcode')} />
        </Field>
      </div>
      <Field label="Delivery notes" htmlFor="pf-notes">
        <textarea id="pf-notes" className="textarea" maxLength={300} value={form.delivery_notes} onChange={set('delivery_notes')} placeholder="For example: ring the bell twice" />
      </Field>
      <button type="submit" className="btn btn--gold" disabled={busy}>
        {busy ? 'Saving…' : 'Save profile'}
      </button>
    </form>
  )
}

export default function AccountPage() {
  const { user, profile, signOut } = useAuth()
  const [tab, setTab] = useState<Tab>('orders')
  const navigate = useNavigate()
  useDocumentMeta('My account')

  const name = useMemo(() => profile?.full_name || user?.email?.split('@')[0] || 'there', [profile, user])

  return (
    <div className="container page account">
      <header className="page__head account__head">
        <div>
          <p className="section-head__eyebrow">My account</p>
          <h1 className="page__title">Hello, {name}</h1>
        </div>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={async () => {
            await signOut()
            navigate('/')
          }}
        >
          <LogOut size={16} /> Sign out
        </button>
      </header>

      <div className="tabs" role="tablist" aria-label="Account sections">
        {TABS.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={`tabs__tab${tab === item.id ? ' is-active' : ''}`} onClick={() => setTab(item.id)}>
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'orders' && <OrdersTab />}
      {tab === 'reservations' && <ReservationsTab />}
      {tab === 'profile' && <ProfileTab key={profile?.updated_at ?? 'new'} />}
    </div>
  )
}
