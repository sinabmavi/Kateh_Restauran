import { useMemo, useState } from 'react'
import { CircleDollarSign, CreditCard, RefreshCw, Search, TriangleAlert } from 'lucide-react'
import { AdminPageHead, MetricCard } from '../../components/admin'
import { PaymentBadge } from '../../components/badges'
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/primitives'
import { useRequiredSettings } from '../../context/SettingsContext'
import { useToast } from '../../context/ToastContext'
import { useAsync } from '../../hooks/useAsync'
import { errorMessage, unwrap } from '../../lib/errors'
import { formatDateOnly, formatMoney, formatTimeOfDay, formatTimestamp } from '../../lib/format'
import { CLOSED_BAD } from '../../lib/orderStatus'
import { supabase } from '../../lib/supabase'
import type { Id, Order, Payment, Reservation } from '../../lib/types'
import { addDaysToDateString, toCents, zonedDayStartUtc, zonedNow } from '../../../supabase/functions/_shared/rules'

type Filter = 'all' | 'completed' | 'pending' | 'refunded' | 'needs_refund'
type OrderRef = Pick<Order, 'id' | 'order_number' | 'customer_name' | 'customer_email' | 'status' | 'payment_status'>
type ReservationRef = Pick<Reservation, 'id' | 'full_name' | 'email' | 'reservation_date' | 'start_time' | 'status' | 'payment_status'>

interface Row {
  payment: Payment
  reference: string
  name: string
  email: string
  /** Money was captured but the order was declined or the table was lost, so it still has to be refunded in PayPal. */
  needsRefund: boolean
}

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'completed', label: 'Completed' },
  { id: 'pending', label: 'Pending / abandoned' },
  { id: 'refunded', label: 'Refunded' },
  { id: 'needs_refund', label: 'Needs refund' },
]

export default function PaymentsPage() {
  const settings = useRequiredSettings()
  const toast = useToast()
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState<Id | null>(null)

  const state = useAsync(async () => {
    const payments = unwrap<Payment[]>(await supabase.from('payments').select('*').order('created_at', { ascending: false }).limit(600)).map((payment) => ({ ...payment, amount: Number(payment.amount) }))
    const orderIds = [...new Set(payments.map((payment) => payment.order_id).filter((id): id is Id => Boolean(id)))]
    const reservationIds = [...new Set(payments.map((payment) => payment.reservation_id).filter((id): id is Id => Boolean(id)))]
    const [orders, reservations] = await Promise.all([
      orderIds.length
        ? supabase.from('orders').select('id, order_number, customer_name, customer_email, status, payment_status').in('id', orderIds)
        : Promise.resolve({ data: [], error: null }),
      reservationIds.length
        ? supabase.from('reservations').select('id, full_name, email, reservation_date, start_time, status, payment_status').in('id', reservationIds)
        : Promise.resolve({ data: [], error: null }),
    ])
    return {
      payments,
      orders: new Map(unwrap<OrderRef[]>(orders).map((order) => [order.id, order])),
      reservations: new Map(unwrap<ReservationRef[]>(reservations).map((reservation) => [reservation.id, reservation])),
    }
  }, [])

  const rows = useMemo<Row[]>(() => {
    if (!state.data) return []
    return state.data.payments.map((payment) => {
      const order = payment.order_id ? state.data!.orders.get(payment.order_id) : undefined
      const reservation = payment.reservation_id ? state.data!.reservations.get(payment.reservation_id) : undefined
      const needsRefund =
        payment.status === 'completed' &&
        ((order !== undefined && CLOSED_BAD.includes(order.status) && order.payment_status === 'paid') ||
          (reservation !== undefined && reservation.status === 'cancelled' && reservation.payment_status === 'paid'))
      return {
        payment,
        reference: order
          ? `Order #${order.order_number}`
          : reservation
            ? `Deposit · ${formatDateOnly(reservation.reservation_date, 'd MMM')} ${formatTimeOfDay(reservation.start_time)}`
            : payment.kind === 'order'
              ? 'Order'
              : 'Reservation deposit',
        name: payment.payer_name || order?.customer_name || reservation?.full_name || '',
        email: payment.payer_email || order?.customer_email || reservation?.email || '',
        needsRefund,
      }
    })
  }, [state.data])

  const totals = useMemo(() => {
    const today = zonedNow(settings.timezone).date
    const startToday = zonedDayStartUtc(today, settings.timezone).getTime()
    const startWeek = zonedDayStartUtc(addDaysToDateString(today, -6), settings.timezone).getTime()
    const empty = () => ({ orders: 0, deposits: 0 })
    const buckets = { today: empty(), week: empty(), all: empty() }
    for (const { payment } of rows) {
      if (payment.status !== 'completed') continue
      const at = new Date(payment.captured_at ?? payment.created_at).getTime()
      const key = payment.kind === 'order' ? 'orders' : 'deposits'
      const cents = toCents(payment.amount)
      buckets.all[key] += cents
      if (at >= startWeek) buckets.week[key] += cents
      if (at >= startToday) buckets.today[key] += cents
    }
    return buckets
  }, [rows, settings.timezone])

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return rows.filter(({ payment, needsRefund, name, email, reference }) => {
      if (filter === 'completed' && payment.status !== 'completed') return false
      if (filter === 'pending' && payment.status !== 'created' && payment.status !== 'failed') return false
      if (filter === 'refunded' && payment.status !== 'refunded') return false
      if (filter === 'needs_refund' && !needsRefund) return false
      if (!needle) return true
      return [name, email, reference, payment.paypal_order_id, payment.paypal_capture_id ?? ''].some((text) => text.toLowerCase().includes(needle))
    })
  }, [rows, filter, search])

  const needsRefundCount = rows.filter((row) => row.needsRefund).length

  const markRefunded = async (row: Row) => {
    setBusyId(row.payment.id)
    try {
      const { payment } = row
      const parent = payment.order_id
        ? await supabase.from('orders').update({ payment_status: 'refunded' }).eq('id', payment.order_id)
        : await supabase.from('reservations').update({ payment_status: 'refunded' }).eq('id', payment.reservation_id ?? '')
      if (parent.error) throw parent.error
      // The payments table may be read-only for admins; the order or reservation is what clears the flag.
      await supabase.from('payments').update({ status: 'refunded' }).eq('id', payment.id)
      toast.success('Marked as refunded')
      state.reload()
    } catch (failure) {
      toast.error(errorMessage(failure))
    } finally {
      setBusyId(null)
    }
  }

  const money = (cents: number) => formatMoney(cents / 100, settings.currency)

  return (
    <>
      <AdminPageHead
        title="Payments"
        subtitle="Every PayPal payment for orders and reservation deposits."
        actions={
          <button type="button" className="btn btn--ghost btn--sm" disabled={state.loading} onClick={state.reload}>
            <RefreshCw size={15} /> {state.loading && state.data ? 'Refreshing…' : 'Refresh'}
          </button>
        }
      />

      <div className="metrics">
        {(
          [
            ['Collected today', totals.today],
            ['Last 7 days', totals.week],
            ['All time', totals.all],
          ] as const
        ).map(([label, bucket]) => (
          <MetricCard key={label} label={label} icon={<CircleDollarSign size={20} />} tone="gold" value={money(bucket.orders + bucket.deposits)} hint={`Orders ${money(bucket.orders)} · Deposits ${money(bucket.deposits)}`} />
        ))}
      </div>

      {needsRefundCount > 0 && (
        <div className="notice notice--danger apage-notice" role="alert">
          <TriangleAlert size={18} />
          <span>
            <strong>{needsRefundCount}</strong> {needsRefundCount === 1 ? 'payment was' : 'payments were'} captured but the order was declined or the table was lost. Refund {needsRefundCount === 1 ? 'it' : 'them'} from your PayPal dashboard, then mark as refunded here.
          </span>
        </div>
      )}

      <div className="toolbar">
        <div className="filters" role="tablist">
          {FILTERS.map((entry) => (
            <button key={entry.id} type="button" role="tab" aria-selected={filter === entry.id} className={`chip${filter === entry.id ? ' is-active' : ''}`} onClick={() => setFilter(entry.id)}>
              {entry.label}
              {entry.id === 'needs_refund' && needsRefundCount > 0 && <span className="chip__count">{needsRefundCount}</span>}
            </button>
          ))}
        </div>
        <label className="toolbar__search">
          <Search size={17} />
          <input type="search" className="toolbar__input" placeholder="Search name, email, order # or PayPal id" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search payments" />
        </label>
      </div>

      {state.error ? (
        <ErrorState message={state.error} onRetry={state.reload} />
      ) : !state.data ? (
        <Skeleton style={{ height: 260, borderRadius: 22 }} />
      ) : visible.length === 0 ? (
        <EmptyState icon={<CreditCard size={28} />} title="No payments" text="Payments will appear here as guests pay for orders and reservation deposits." />
      ) : (
        <div className="table-wrap card">
          <table className="dt">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Reference</th>
                <th>Payer</th>
                <th className="num">Amount</th>
                <th>Transaction</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.payment.id} className={row.needsRefund ? 'is-alert' : undefined}>
                  <td data-label="Date">
                    <span className="dt__stack">
                      <strong>{formatTimestamp(row.payment.captured_at ?? row.payment.created_at, 'd MMM yyyy')}</strong>
                      <small>{formatTimestamp(row.payment.captured_at ?? row.payment.created_at, 'h:mm a')}</small>
                    </span>
                  </td>
                  <td data-label="Type">{row.payment.kind === 'order' ? 'Order' : 'Reservation deposit'}</td>
                  <td data-label="Reference">
                    <strong>{row.reference}</strong>
                  </td>
                  <td data-label="Payer">
                    <span className="dt__stack">
                      {row.name || '—'}
                      <small>{row.email}</small>
                    </span>
                  </td>
                  <td data-label="Amount" className="num">
                    <strong>{formatMoney(row.payment.amount, row.payment.currency)}</strong>
                    <small className="dt__cur">{row.payment.currency}</small>
                  </td>
                  <td data-label="Transaction">
                    <code className="dt__code">{row.payment.paypal_capture_id ?? row.payment.paypal_order_id}</code>
                  </td>
                  <td data-label="Status">
                    <span className="dt__badges">
                      <PaymentBadge status={row.payment.status} />
                      {row.needsRefund && (
                        <>
                          <span className="badge badge--danger">Needs refund</span>
                          <button type="button" className="btn btn--ghost btn--sm" disabled={busyId === row.payment.id} onClick={() => void markRefunded(row)}>
                            Mark refunded
                          </button>
                        </>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
