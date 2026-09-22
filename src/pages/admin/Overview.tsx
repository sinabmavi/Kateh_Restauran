import { Link } from 'react-router-dom'
import { Armchair, CalendarCheck, CalendarClock, CircleDollarSign, Clock, ShoppingBag, Sparkles, Users } from 'lucide-react'
import { AdminPageHead, MetricCard, Panel } from '../../components/admin'
import { OrderStatusBadge, ReservationStatusBadge } from '../../components/badges'
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/primitives'
import { useRequiredSettings } from '../../context/SettingsContext'
import { useAsync } from '../../hooks/useAsync'
import { AppError, friendlyMessage, unwrap } from '../../lib/errors'
import { formatMoney, formatTimeOfDay, timeAgo } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import type { Reservation, RestaurantTable } from '../../lib/types'
import { addDaysToDateString, toCents, zonedDayStartUtc, zonedNow } from '../../../supabase/functions/_shared/rules'
import { useAdminOrders } from './AdminOrdersContext'

async function count(query: PromiseLike<{ count: number | null; error: { message: string; code?: string } | null }>): Promise<number> {
  const response = await query
  if (response.error) throw new AppError(friendlyMessage(response.error.message, response.error.code), response.error.code)
  return response.count ?? 0
}

export default function OverviewPage() {
  const settings = useRequiredSettings()
  const { orders, awaiting, loading: ordersLoading } = useAdminOrders()

  const stats = useAsync(async () => {
    const today = zonedNow(settings.timezone).date
    const startToday = zonedDayStartUtc(today, settings.timezone).toISOString()
    const startTomorrow = zonedDayStartUtc(addDaysToDateString(today, 1), settings.timezone).toISOString()

    const head = { count: 'exact' as const, head: true }
    const [todayOrders, todayReservations, upcoming, pending, confirmed, tables, featured, todaysList] = await Promise.all([
      supabase.from('orders').select('total, status, payment_status').gte('created_at', startToday).lt('created_at', startTomorrow),
      count(supabase.from('reservations').select('id', head).eq('reservation_date', today).neq('status', 'cancelled')),
      count(supabase.from('reservations').select('id', head).gte('reservation_date', today).in('status', ['pending', 'confirmed'])),
      count(supabase.from('reservations').select('id', head).gte('reservation_date', today).eq('status', 'pending')),
      count(supabase.from('reservations').select('id', head).gte('reservation_date', today).eq('status', 'confirmed')),
      count(supabase.from('restaurant_tables').select('id', head).eq('is_active', true)),
      count(supabase.from('menu_items').select('id', head).eq('is_active', true).eq('is_featured', true)),
      supabase.from('reservations').select('*').eq('reservation_date', today).neq('status', 'cancelled').order('start_time', { ascending: true }),
    ])

    const placedToday = unwrap<Array<{ total: number; status: string; payment_status: string }>>(todayOrders).filter((order) => order.status !== 'pending_payment')
    const revenueCents = placedToday
      .filter((order) => order.payment_status === 'paid' && order.status !== 'cancelled' && order.status !== 'rejected')
      .reduce((sum, order) => sum + toCents(order.total), 0)

    const list = unwrap<Reservation[]>(todaysList)
    const tableRows = list.length ? unwrap<RestaurantTable[]>(await supabase.from('restaurant_tables').select('*').in('id', [...new Set(list.map((entry) => entry.table_id))])) : []

    return {
      ordersToday: placedToday.length,
      revenue: revenueCents / 100,
      todayReservations,
      upcoming,
      pending,
      confirmed,
      tables,
      featured,
      list,
      tableNames: new Map(tableRows.map((table) => [table.id, table.table_name])),
    }
  }, [settings.timezone])

  const needsAction = orders.filter((order) => order.status === 'placed').slice(0, 5)

  return (
    <>
      <AdminPageHead title="Overview" subtitle="How the restaurant is doing today." />

      {stats.error ? (
        <ErrorState message={stats.error} onRetry={stats.reload} />
      ) : (
        <div className="metrics">
          <MetricCard label="Orders today" icon={<ShoppingBag size={20} />} tone="gold" to="/admin/orders" value={stats.data ? stats.data.ordersToday : '…'} />
          <MetricCard label="Revenue today" icon={<CircleDollarSign size={20} />} tone="ok" to="/admin/payments" value={stats.data ? formatMoney(stats.data.revenue, settings.currency) : '…'} hint="Paid orders" />
          <MetricCard label="Awaiting acceptance" icon={<Clock size={20} />} tone={awaiting > 0 ? 'danger' : 'default'} to="/admin/orders" value={ordersLoading ? '…' : awaiting} />
          <MetricCard label="Reservations today" icon={<CalendarCheck size={20} />} to="/admin/reservations" value={stats.data ? stats.data.todayReservations : '…'} />
          <MetricCard label="Upcoming" icon={<CalendarClock size={20} />} to="/admin/reservations" value={stats.data ? stats.data.upcoming : '…'} hint="Pending and confirmed" />
          <MetricCard label="Pending" icon={<Users size={20} />} tone="gold" to="/admin/reservations" value={stats.data ? stats.data.pending : '…'} hint="Need confirming" />
          <MetricCard label="Confirmed" icon={<CalendarCheck size={20} />} tone="ok" to="/admin/reservations" value={stats.data ? stats.data.confirmed : '…'} />
          <MetricCard label="Active tables" icon={<Armchair size={20} />} to="/admin/tables" value={stats.data ? stats.data.tables : '…'} />
          <MetricCard label="Featured dishes" icon={<Sparkles size={20} />} to="/admin/menu" value={stats.data ? stats.data.featured : '…'} />
        </div>
      )}

      <div className="panels">
        <Panel
          title="Orders needing action"
          action={
            <Link to="/admin/orders" className="link">
              Open orders
            </Link>
          }
        >
          {ordersLoading ? (
            <Skeleton style={{ height: 96 }} />
          ) : needsAction.length === 0 ? (
            <EmptyState icon={<ShoppingBag size={24} />} title="All caught up" text="No orders are waiting to be accepted." />
          ) : (
            <ul className="mini-list">
              {needsAction.map((order) => (
                <li key={order.id}>
                  <Link to="/admin/orders" className="mini-list__row">
                    <span>
                      <strong>#{String(order.order_number)}</strong> · {order.customer_name}
                      <small>
                        {order.order_type === 'delivery' ? 'Delivery' : 'Pickup'} · {timeAgo(order.created_at)}
                      </small>
                    </span>
                    <span className="mini-list__end">
                      <strong>{formatMoney(order.total, order.currency)}</strong>
                      <OrderStatusBadge status={order.status} type={order.order_type} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Today’s reservations"
          action={
            <Link to="/admin/reservations" className="link">
              All reservations
            </Link>
          }
        >
          {!stats.data ? (
            <Skeleton style={{ height: 96 }} />
          ) : stats.data.list.length === 0 ? (
            <EmptyState icon={<CalendarCheck size={24} />} title="No bookings today" text="Reservations for today will be listed here." />
          ) : (
            <ul className="mini-list">
              {stats.data.list.map((reservation) => (
                <li key={reservation.id}>
                  <Link to="/admin/reservations" className="mini-list__row">
                    <span>
                      <strong>{formatTimeOfDay(reservation.start_time)}</strong> · {reservation.full_name}
                      <small>
                        Party of {reservation.party_size} · {stats.data!.tableNames.get(reservation.table_id) ?? 'Table'}
                      </small>
                    </span>
                    <ReservationStatusBadge status={reservation.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  )
}
