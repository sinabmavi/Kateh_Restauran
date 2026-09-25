import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { Cake, CalendarCheck, Download, Mail, MailCheck, Phone, RefreshCw, Search, ShoppingBag, UserPlus, Users } from 'lucide-react'
import { AdminPageHead, MetricCard } from '../../../components/admin'
import { OrderStatusBadge, ReservationStatusBadge } from '../../../components/badges'
import { Sheet } from '../../../components/ui/Sheet'
import { EmptyState, ErrorState, Skeleton } from '../../../components/ui/primitives'
import { useRequiredSettings } from '../../../context/SettingsContext'
import { useAsync } from '../../../hooks/useAsync'
import { customerInitials, fetchCustomers, isReachable, isSetupMissing, lastActivityMs, type ClubCustomer } from '../../../lib/club'
import { fetchOrderItems, normaliseOrder } from '../../../lib/data'
import { unwrap } from '../../../lib/errors'
import { formatDateOnly, formatMoney, formatTimeOfDay, formatTimestamp, telHref } from '../../../lib/format'
import { supabase } from '../../../lib/supabase'
import type { Order, Reservation, RestaurantTable } from '../../../lib/types'
import { zonedNow } from '../../../../supabase/functions/_shared/rules'

type SearchField = 'all' | 'name' | 'email' | 'phone'
type Segment = 'all' | 'new7' | 'birthday_month' | 'ordered' | 'never_ordered' | 'subscribed' | 'unsubscribed' | 'unverified'
type Sort = 'joined_desc' | 'joined_asc' | 'name_asc' | 'name_desc' | 'orders_desc' | 'spent_desc' | 'activity_desc'

const PAGE = 100

const SEGMENTS: Array<{ value: Segment; label: string }> = [
  { value: 'all', label: 'All members' },
  { value: 'new7', label: 'Joined in the last 7 days' },
  { value: 'birthday_month', label: 'Birthday this month' },
  { value: 'ordered', label: 'Has ordered' },
  { value: 'never_ordered', label: 'Never ordered' },
  { value: 'subscribed', label: 'Subscribed to emails' },
  { value: 'unsubscribed', label: 'Unsubscribed' },
  { value: 'unverified', label: 'Email not verified' },
]

const SORTS: Array<{ value: Sort; label: string }> = [
  { value: 'joined_desc', label: 'Newest members' },
  { value: 'joined_asc', label: 'Oldest members' },
  { value: 'name_asc', label: 'Name A–Z' },
  { value: 'name_desc', label: 'Name Z–A' },
  { value: 'orders_desc', label: 'Most orders' },
  { value: 'spent_desc', label: 'Highest spend' },
  { value: 'activity_desc', label: 'Recently active' },
]

const localDay = (iso: string) => format(parseISO(iso), 'yyyy-MM-dd')

function downloadCsv(customers: ClubCustomer[]) {
  const header = ['Name', 'Email', 'Phone', 'Birthday', 'Joined', 'Orders', 'Reservations', 'Total spent', 'Email verified', 'Subscribed']
  const cell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`
  const lines = customers.map((customer) =>
    [
      customer.full_name ?? '',
      customer.email ?? '',
      customer.phone ?? '',
      customer.birthday ?? '',
      localDay(customer.joined_at),
      customer.orders_count,
      customer.reservations_count,
      customer.total_spent.toFixed(2),
      customer.email_confirmed ? 'yes' : 'no',
      customer.marketing_opt_out ? 'no' : 'yes',
    ]
      .map(cell)
      .join(','),
  )
  const blob = new Blob([`﻿${[header.map(cell).join(','), ...lines].join('\r\n')}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `customers-${format(new Date(), 'yyyy-MM-dd')}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/* ------------------------------------------------------------------ history */

interface HistoryEntry {
  kind: 'order' | 'reservation'
  id: string
  title: string
  subtitle: string
  when: string
  sortKey: number
  badge: ReactNode
  amount?: string
}

function CustomerSheet({ customer, onClose }: { customer: ClubCustomer | null; onClose: () => void }) {
  const settings = useRequiredSettings()
  const [kind, setKind] = useState<'all' | 'order' | 'reservation'>('all')

  const history = useAsync(async (): Promise<HistoryEntry[]> => {
    if (!customer) return []
    const email = (customer.email ?? '').replace(/"/g, '')
    const byOrders = `user_id.eq.${customer.user_id}${email ? `,customer_email.ilike."${email}"` : ''}`
    const byReservations = `user_id.eq.${customer.user_id}${email ? `,email.ilike."${email}"` : ''}`
    const [ordersRes, reservationsRes, tablesRes] = await Promise.all([
      supabase.from('orders').select('*').or(byOrders).neq('status', 'pending_payment').order('created_at', { ascending: false }).limit(200),
      supabase.from('reservations').select('*').or(byReservations).order('reservation_date', { ascending: false }).limit(200),
      supabase.from('restaurant_tables').select('id, table_name'),
    ])
    const orders = unwrap<Order[]>(ordersRes).map(normaliseOrder)
    const reservations = unwrap<Reservation[]>(reservationsRes)
    const tables = new Map(unwrap<Pick<RestaurantTable, 'id' | 'table_name'>[]>(tablesRes).map((table) => [table.id, table.table_name]))
    const items = await fetchOrderItems(orders.map((order) => order.id))

    const orderEntries: HistoryEntry[] = orders.map((order) => ({
      kind: 'order',
      id: order.id,
      title: `Order #${String(order.order_number)} · ${order.order_type === 'delivery' ? 'Delivery' : 'Pickup'}`,
      subtitle: (items.get(order.id) ?? []).map((item) => `${item.quantity}× ${item.name}`).join(', ') || 'No items recorded',
      when: formatTimestamp(order.created_at, 'EEE d MMM yyyy, h:mm a'),
      sortKey: new Date(order.created_at).getTime(),
      badge: <OrderStatusBadge status={order.status} type={order.order_type} />,
      amount: formatMoney(order.total, order.currency || settings.currency),
    }))
    const reservationEntries: HistoryEntry[] = reservations.map((reservation) => ({
      kind: 'reservation',
      id: reservation.id,
      title: `Table for ${reservation.party_size} · ${tables.get(reservation.table_id) ?? 'Table'}`,
      subtitle: `Booked on ${formatTimestamp(reservation.created_at, 'd MMM yyyy')}${reservation.special_requests ? ` · “${reservation.special_requests}”` : ''}`,
      when: `${formatDateOnly(reservation.reservation_date, 'EEE d MMM yyyy')}, ${formatTimeOfDay(reservation.start_time)}`,
      sortKey: new Date(`${reservation.reservation_date}T${reservation.start_time}`).getTime(),
      badge: <ReservationStatusBadge status={reservation.status} />,
    }))
    return [...orderEntries, ...reservationEntries].sort((a, b) => b.sortKey - a.sortKey)
  }, [customer?.user_id])

  const entries = (history.data ?? []).filter((entry) => kind === 'all' || entry.kind === kind)
  const counts = {
    all: history.data?.length ?? 0,
    order: history.data?.filter((entry) => entry.kind === 'order').length ?? 0,
    reservation: history.data?.filter((entry) => entry.kind === 'reservation').length ?? 0,
  }

  return (
    <Sheet open={Boolean(customer)} onClose={onClose} placement="right" wide title={customer?.full_name || customer?.email || 'Customer'}>
      {customer && (
        <div className="club-profile">
          <div className="club-profile__head">
            <span className="club-avatar club-avatar--lg">{customerInitials(customer)}</span>
            <div className="club-profile__who">
              <strong>{customer.full_name || 'No name'}</strong>
              {customer.email && (
                <a href={`mailto:${customer.email}`} className="link">
                  {customer.email}
                </a>
              )}
              {customer.phone && (
                <a href={telHref(customer.phone)} className="link">
                  {customer.phone}
                </a>
              )}
            </div>
          </div>

          <dl className="club-facts">
            <div>
              <dt>Birthday</dt>
              <dd>{customer.birthday ? formatDateOnly(customer.birthday, 'd MMMM yyyy') : '—'}</dd>
            </div>
            <div>
              <dt>Member since</dt>
              <dd>{formatTimestamp(customer.joined_at, 'd MMM yyyy')}</dd>
            </div>
            <div>
              <dt>Last sign in</dt>
              <dd>{customer.last_sign_in_at ? formatTimestamp(customer.last_sign_in_at, 'd MMM yyyy') : 'Never'}</dd>
            </div>
            <div>
              <dt>Emails</dt>
              <dd>{!customer.email_confirmed ? 'Email not verified' : customer.marketing_opt_out ? 'Unsubscribed' : 'Subscribed'}</dd>
            </div>
            <div>
              <dt>Orders</dt>
              <dd>{customer.orders_count}</dd>
            </div>
            <div>
              <dt>Reservations</dt>
              <dd>{customer.reservations_count}</dd>
            </div>
            <div>
              <dt>Total spent</dt>
              <dd>{formatMoney(customer.total_spent, settings.currency)}</dd>
            </div>
          </dl>

          <div className="club-history">
            <h3 className="panel__title">History</h3>
            <div className="filters" role="tablist" aria-label="History filter">
              {(
                [
                  ['all', 'All'],
                  ['order', 'Orders'],
                  ['reservation', 'Reservations'],
                ] as const
              ).map(([value, label]) => (
                <button key={value} type="button" role="tab" aria-selected={kind === value} className={`chip${kind === value ? ' is-active' : ''}`} onClick={() => setKind(value)}>
                  {label}
                  {counts[value] > 0 && <span className="chip__count chip__count--quiet">{counts[value]}</span>}
                </button>
              ))}
            </div>

            {history.error ? (
              <ErrorState message={history.error} onRetry={history.reload} />
            ) : history.loading ? (
              <Skeleton style={{ height: 160, borderRadius: 16 }} />
            ) : entries.length === 0 ? (
              <EmptyState icon={<ShoppingBag size={24} />} title="Nothing yet" text={kind === 'reservation' ? 'No reservations for this customer.' : kind === 'order' ? 'No orders for this customer.' : 'No orders or reservations yet.'} />
            ) : (
              <ul className="club-timeline">
                {entries.map((entry) => (
                  <li key={`${entry.kind}-${entry.id}`} className="club-timeline__item">
                    <span className={`club-timeline__icon club-timeline__icon--${entry.kind}`}>{entry.kind === 'order' ? <ShoppingBag size={16} /> : <CalendarCheck size={16} />}</span>
                    <div className="club-timeline__body">
                      <div className="club-timeline__top">
                        <strong>{entry.title}</strong>
                        {entry.amount && <strong className="club-timeline__amount">{entry.amount}</strong>}
                      </div>
                      <small className="club-timeline__when">{entry.when}</small>
                      <p className="club-timeline__sub">{entry.subtitle}</p>
                      <div>{entry.badge}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Sheet>
  )
}

/* -------------------------------------------------------------------- page */

export default function ClubCustomersPage() {
  const settings = useRequiredSettings()
  const navigate = useNavigate()
  const state = useAsync(fetchCustomers, [])
  const [search, setSearch] = useState('')
  const [field, setField] = useState<SearchField>('all')
  const [joinedFrom, setJoinedFrom] = useState('')
  const [joinedTo, setJoinedTo] = useState('')
  const [segment, setSegment] = useState<Segment>('all')
  const [sort, setSort] = useState<Sort>('joined_desc')
  const [limit, setLimit] = useState(PAGE)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState<ClubCustomer | null>(null)

  const customers = state.data ?? []
  const today = zonedNow(settings.timezone).date
  const weekAgo = Date.now() - 7 * 86_400_000

  const stats = useMemo(
    () => ({
      total: customers.length,
      newThisWeek: customers.filter((customer) => new Date(customer.joined_at).getTime() >= weekAgo).length,
      birthdays: customers.filter((customer) => customer.birthday?.slice(5, 7) === today.slice(5, 7)).length,
      subscribed: customers.filter(isReachable).length,
    }),
    [customers, today, weekAgo],
  )

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const digits = needle.replace(/\D/g, '')
    const list = customers.filter((customer) => {
      if (needle) {
        const name = (customer.full_name ?? '').toLowerCase()
        const email = (customer.email ?? '').toLowerCase()
        const phone = (customer.phone ?? '').toLowerCase()
        const phoneHit = phone.includes(needle) || (digits.length >= 3 && phone.replace(/\D/g, '').includes(digits))
        const hit = field === 'name' ? name.includes(needle) : field === 'email' ? email.includes(needle) : field === 'phone' ? phoneHit : name.includes(needle) || email.includes(needle) || phoneHit
        if (!hit) return false
      }
      const joined = localDay(customer.joined_at)
      if (joinedFrom && joined < joinedFrom) return false
      if (joinedTo && joined > joinedTo) return false
      switch (segment) {
        case 'new7':
          return new Date(customer.joined_at).getTime() >= weekAgo
        case 'birthday_month':
          return customer.birthday?.slice(5, 7) === today.slice(5, 7)
        case 'ordered':
          return customer.orders_count > 0
        case 'never_ordered':
          return customer.orders_count === 0
        case 'subscribed':
          return isReachable(customer)
        case 'unsubscribed':
          return customer.marketing_opt_out
        case 'unverified':
          return !customer.email_confirmed
        default:
          return true
      }
    })
    const name = (customer: ClubCustomer) => (customer.full_name || customer.email || '').toLowerCase()
    const sorters: Record<Sort, (a: ClubCustomer, b: ClubCustomer) => number> = {
      joined_desc: (a, b) => b.joined_at.localeCompare(a.joined_at),
      joined_asc: (a, b) => a.joined_at.localeCompare(b.joined_at),
      name_asc: (a, b) => name(a).localeCompare(name(b)),
      name_desc: (a, b) => name(b).localeCompare(name(a)),
      orders_desc: (a, b) => b.orders_count - a.orders_count || b.total_spent - a.total_spent,
      spent_desc: (a, b) => b.total_spent - a.total_spent,
      activity_desc: (a, b) => lastActivityMs(b) - lastActivityMs(a),
    }
    return [...list].sort(sorters[sort])
  }, [customers, search, field, joinedFrom, joinedTo, segment, sort, today, weekAgo])

  const visible = filtered.slice(0, limit)
  const allFilteredSelected = filtered.length > 0 && filtered.every((customer) => selected.has(customer.user_id))
  const filtersActive = Boolean(search || joinedFrom || joinedTo || segment !== 'all')

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const toggleAll = () =>
    setSelected((current) => {
      const next = new Set(current)
      if (allFilteredSelected) filtered.forEach((customer) => next.delete(customer.user_id))
      else filtered.forEach((customer) => next.add(customer.user_id))
      return next
    })

  const resetFilters = () => {
    setSearch('')
    setField('all')
    setJoinedFrom('')
    setJoinedTo('')
    setSegment('all')
    setLimit(PAGE)
  }

  const setupMissing = isSetupMissing(state.error)

  return (
    <>
      <AdminPageHead
        title="Customers"
        subtitle="Everyone who has created an account on the website. Click a customer to see all their orders and reservations."
        actions={
          <>
            <button type="button" className="btn btn--ghost btn--sm" disabled={state.loading} onClick={state.reload}>
              <RefreshCw size={15} /> {state.loading && state.data ? 'Refreshing…' : 'Refresh'}
            </button>
            <button type="button" className="btn btn--ghost btn--sm" disabled={filtered.length === 0} onClick={() => downloadCsv(filtered)}>
              <Download size={15} /> Export CSV
            </button>
          </>
        }
      />

      {setupMissing ? (
        <div className="notice notice--info" role="status">
          The Customer Club is not set up in the database yet. Run <strong>09_customer_club.sql</strong> in the Supabase SQL Editor, then refresh.
        </div>
      ) : state.error ? (
        <ErrorState message={state.error} onRetry={state.reload} />
      ) : (
        <>
          <div className="metrics">
            <MetricCard label="Members" icon={<Users size={20} />} tone="gold" value={state.data ? stats.total : '…'} />
            <MetricCard label="Joined this week" icon={<UserPlus size={20} />} tone="ok" value={state.data ? stats.newThisWeek : '…'} />
            <MetricCard label="Birthdays this month" icon={<Cake size={20} />} value={state.data ? stats.birthdays : '…'} />
            <MetricCard label="Subscribed to emails" icon={<MailCheck size={20} />} value={state.data ? stats.subscribed : '…'} hint="Verified and not unsubscribed" />
          </div>

          <div className="club-filters card card--pad">
            <label className="toolbar__search club-filters__search">
              <Search size={17} />
              <input
                type="search"
                className="toolbar__input"
                placeholder={field === 'all' ? 'Search name, email or phone' : `Search by ${field}`}
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setLimit(PAGE)
                }}
                aria-label="Search customers"
              />
            </label>
            <select className="select select--sm" value={field} onChange={(event) => setField(event.target.value as SearchField)} aria-label="Search in">
              <option value="all">All fields</option>
              <option value="name">Name</option>
              <option value="email">Email</option>
              <option value="phone">Phone</option>
            </select>
            <label className="club-filters__date">
              <span>Joined from</span>
              <input type="date" className="input input--sm" value={joinedFrom} max={joinedTo || undefined} onChange={(event) => setJoinedFrom(event.target.value)} />
            </label>
            <label className="club-filters__date">
              <span>to</span>
              <input type="date" className="input input--sm" value={joinedTo} min={joinedFrom || undefined} onChange={(event) => setJoinedTo(event.target.value)} />
            </label>
            <select className="select select--sm" value={segment} onChange={(event) => setSegment(event.target.value as Segment)} aria-label="Segment">
              {SEGMENTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select className="select select--sm" value={sort} onChange={(event) => setSort(event.target.value as Sort)} aria-label="Sort">
              {SORTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {filtersActive && (
              <button type="button" className="btn btn--ghost btn--sm" onClick={resetFilters}>
                Clear filters
              </button>
            )}
          </div>

          {selected.size > 0 && (
            <div className="club-selection" role="status">
              <strong>{selected.size}</strong> {selected.size === 1 ? 'customer' : 'customers'} selected
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setSelected(new Set())}>
                Clear
              </button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => downloadCsv(customers.filter((customer) => selected.has(customer.user_id)))}>
                <Download size={15} /> Export selected
              </button>
              <button type="button" className="btn btn--gold btn--sm" onClick={() => navigate('/admin/club/email', { state: { audience: { mode: 'selected', user_ids: [...selected] } } })}>
                <Mail size={15} /> Email selected
              </button>
            </div>
          )}

          {!state.data ? (
            <Skeleton style={{ height: 320, borderRadius: 22 }} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<Users size={28} />}
              title={customers.length === 0 ? 'No customers yet' : 'No customers match'}
              text={customers.length === 0 ? 'Customers appear here as soon as they create an account on the website.' : 'Try different filters.'}
            />
          ) : (
            <>
              <p className="muted-note club-count">
                Showing {visible.length} of {filtered.length} {filtered.length === 1 ? 'customer' : 'customers'}
                {filtered.length !== customers.length && ` (filtered from ${customers.length})`}
              </p>
              <div className="table-wrap card">
                <table className="dt club-table">
                  <thead>
                    <tr>
                      <th className="club-table__check">
                        <input type="checkbox" className="club-check" checked={allFilteredSelected} onChange={toggleAll} aria-label={`Select all ${filtered.length} customers`} />
                      </th>
                      <th>Customer</th>
                      <th>Phone</th>
                      <th>Birthday</th>
                      <th>Joined</th>
                      <th className="num">Orders</th>
                      <th className="num">Bookings</th>
                      <th className="num">Spent</th>
                      <th>Emails</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((customer) => {
                      const birthdayToday = customer.birthday?.slice(5, 10) === today.slice(5, 10)
                      return (
                        <tr key={customer.user_id} className={`is-clickable${selected.has(customer.user_id) ? ' is-selected' : ''}`} onClick={() => setOpen(customer)}>
                          <td className="club-table__check" data-label="" onClick={(event) => event.stopPropagation()}>
                            <input type="checkbox" className="club-check" checked={selected.has(customer.user_id)} onChange={() => toggle(customer.user_id)} aria-label={`Select ${customer.full_name || customer.email}`} />
                          </td>
                          <td data-label="Customer">
                            <span className="dish-cell">
                              <span className="club-avatar">{customerInitials(customer)}</span>
                              <span className="dt__stack">
                                <strong>{customer.full_name || 'No name'}</strong>
                                <small>{customer.email}</small>
                              </span>
                            </span>
                          </td>
                          <td data-label="Phone">
                            {customer.phone ? (
                              <span className="dt__inline">
                                <Phone size={13} /> {customer.phone}
                              </span>
                            ) : (
                              <span className="muted-note">—</span>
                            )}
                          </td>
                          <td data-label="Birthday">
                            {customer.birthday ? (
                              <span className={`dt__inline${birthdayToday ? ' club-bday' : ''}`}>
                                {birthdayToday && <Cake size={14} />}
                                {formatDateOnly(customer.birthday, 'd MMM yyyy')}
                              </span>
                            ) : (
                              <span className="muted-note">—</span>
                            )}
                          </td>
                          <td data-label="Joined">{formatTimestamp(customer.joined_at, 'd MMM yyyy')}</td>
                          <td data-label="Orders" className="num">
                            {customer.orders_count}
                          </td>
                          <td data-label="Bookings" className="num">
                            {customer.reservations_count}
                          </td>
                          <td data-label="Spent" className="num">
                            {formatMoney(customer.total_spent, settings.currency)}
                          </td>
                          <td data-label="Emails">
                            {!customer.email_confirmed ? (
                              <span className="badge">Not verified</span>
                            ) : customer.marketing_opt_out ? (
                              <span className="badge badge--danger">Unsubscribed</span>
                            ) : (
                              <span className="badge badge--ok">Subscribed</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {filtered.length > visible.length && (
                <div className="club-more">
                  <button type="button" className="btn btn--ghost" onClick={() => setLimit((value) => value + PAGE)}>
                    Show more
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      <CustomerSheet customer={open} onClose={() => setOpen(null)} />
    </>
  )
}
