import { useMemo, useState } from 'react'
import { CalendarCheck, Check, TriangleAlert, X } from 'lucide-react'
import { AdminPageHead } from '../../components/admin'
import { PaymentBadge, ReservationStatusBadge } from '../../components/badges'
import { ConfirmDialog } from '../../components/ui/Sheet'
import { EmptyState, ErrorState, Field, Skeleton } from '../../components/ui/primitives'
import { useRequiredSettings } from '../../context/SettingsContext'
import { useToast } from '../../context/ToastContext'
import { useAsync } from '../../hooks/useAsync'
import { errorMessage, unwrap } from '../../lib/errors'
import { formatDateOnly, formatMoney, formatTimeOfDay, telHref } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import type { Id, Reservation, ReservationStatus, RestaurantTable } from '../../lib/types'
import { zonedNow } from '../../../supabase/functions/_shared/rules'

const STATUS_FILTERS: Array<{ value: 'all' | ReservationStatus; label: string }> = [
  { value: 'all', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]

export default function ReservationsPage() {
  const settings = useRequiredSettings()
  const toast = useToast()
  const [status, setStatus] = useState<'all' | ReservationStatus>('all')
  const [from, setFrom] = useState(() => zonedNow(settings.timezone).date)
  const [to, setTo] = useState('')
  const [cancelling, setCancelling] = useState<Reservation | null>(null)
  const [busyId, setBusyId] = useState<Id | null>(null)

  const state = useAsync(async () => {
    let query = supabase.from('reservations').select('*').order('reservation_date', { ascending: true }).order('start_time', { ascending: true }).limit(500)
    if (from) query = query.gte('reservation_date', from)
    if (to) query = query.lte('reservation_date', to)
    if (status !== 'all') query = query.eq('status', status)
    const rows = unwrap<Reservation[]>(await query).map((row) => ({ ...row, deposit_amount: row.deposit_amount === null ? null : Number(row.deposit_amount) }))
    const tables = unwrap<RestaurantTable[]>(await supabase.from('restaurant_tables').select('*'))
    return { rows, tables: new Map(tables.map((table) => [table.id, table.table_name])) }
  }, [from, to, status])

  const grouped = useMemo(() => state.data?.rows ?? [], [state.data])

  const update = async (reservation: Reservation, patch: Partial<Pick<Reservation, 'status' | 'payment_status'>>, message: string) => {
    setBusyId(reservation.id)
    try {
      unwrap(await supabase.from('reservations').update(patch).eq('id', reservation.id).select())
      toast.success(message)
      setCancelling(null)
      state.reload()
    } catch (failure) {
      toast.error(errorMessage(failure))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <AdminPageHead title="Reservations" subtitle="Confirm, complete or cancel bookings. Guests are never told a table is free unless it is." />

      <div className="toolbar toolbar--fields">
        <Field label="Status" htmlFor="rf-status">
          <select id="rf-status" className="select" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
            {STATUS_FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="From" htmlFor="rf-from">
          <input id="rf-from" type="date" className="input" value={from} onChange={(event) => setFrom(event.target.value)} />
        </Field>
        <Field label="To" htmlFor="rf-to">
          <input id="rf-to" type="date" className="input" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} />
        </Field>
        {(from || to) && (
          <button
            type="button"
            className="btn btn--ghost btn--sm toolbar__clear"
            onClick={() => {
              setFrom('')
              setTo('')
            }}
          >
            Clear dates
          </button>
        )}
      </div>

      {state.error ? (
        <ErrorState message={state.error} onRetry={state.reload} />
      ) : !state.data ? (
        <Skeleton style={{ height: 260, borderRadius: 22 }} />
      ) : grouped.length === 0 ? (
        <EmptyState icon={<CalendarCheck size={28} />} title="No reservations" text="No bookings match these filters." />
      ) : (
        <div className="table-wrap card">
          <table className="dt">
            <thead>
              <tr>
                <th>When</th>
                <th>Guest</th>
                <th className="num">Party</th>
                <th>Table</th>
                <th>Status</th>
                <th>Payment</th>
                <th>Requests</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map((reservation) => {
                const refundNeeded = reservation.status === 'cancelled' && reservation.payment_status === 'paid'
                const busy = busyId === reservation.id
                return (
                  <tr key={reservation.id} className={refundNeeded ? 'is-alert' : undefined}>
                    <td data-label="When">
                      <span className="dt__stack">
                        <strong>{formatDateOnly(reservation.reservation_date, 'EEE d MMM')}</strong>
                        <small>
                          {formatTimeOfDay(reservation.start_time)} – {formatTimeOfDay(reservation.end_time)}
                        </small>
                      </span>
                    </td>
                    <td data-label="Guest">
                      <span className="dt__stack">
                        <strong>{reservation.full_name}</strong>
                        <a href={telHref(reservation.phone)} className="link">
                          {reservation.phone}
                        </a>
                        <a href={`mailto:${reservation.email}`} className="link">
                          {reservation.email}
                        </a>
                      </span>
                    </td>
                    <td data-label="Party" className="num">
                      {reservation.party_size}
                    </td>
                    <td data-label="Table">{state.data!.tables.get(reservation.table_id) ?? '—'}</td>
                    <td data-label="Status">
                      <ReservationStatusBadge status={reservation.status} />
                    </td>
                    <td data-label="Payment">
                      <span className="dt__badges">
                        <PaymentBadge status={reservation.payment_status} amount={reservation.deposit_amount} currency={settings.currency} />
                        {refundNeeded && <span className="badge badge--danger">Refund needed</span>}
                      </span>
                    </td>
                    <td data-label="Requests" className="dt__wrap">
                      {reservation.special_requests || <span className="muted-note">—</span>}
                    </td>
                    <td data-label="Actions">
                      <span className="dt__actions">
                        {reservation.status === 'pending' && (
                          <button type="button" className="btn btn--gold btn--sm" disabled={busy} onClick={() => void update(reservation, { status: 'confirmed' }, 'Reservation confirmed')}>
                            <Check size={15} /> Confirm
                          </button>
                        )}
                        {reservation.status === 'confirmed' && (
                          <button type="button" className="btn btn--dark btn--sm" disabled={busy} onClick={() => void update(reservation, { status: 'completed' }, 'Marked as completed')}>
                            <Check size={15} /> Complete
                          </button>
                        )}
                        {(reservation.status === 'pending' || reservation.status === 'confirmed') && (
                          <button type="button" className="btn btn--danger-ghost btn--sm" disabled={busy} onClick={() => setCancelling(reservation)}>
                            <X size={15} /> Cancel
                          </button>
                        )}
                        {reservation.status === 'cancelled' && !refundNeeded && (
                          <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => void update(reservation, { status: 'pending' }, 'Reservation reopened as pending')}>
                            Reopen
                          </button>
                        )}
                        {refundNeeded && (
                          <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => void update(reservation, { payment_status: 'refunded' }, 'Marked as refunded')}>
                            Mark refunded
                          </button>
                        )}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(cancelling)}
        danger
        title="Cancel this reservation?"
        confirmLabel="Cancel reservation"
        busy={busyId !== null}
        message={
          cancelling?.payment_status === 'paid' ? (
            <div className="notice notice--danger">
              <TriangleAlert size={18} />
              <span>
                A deposit of <strong>{formatMoney(cancelling.deposit_amount, settings.currency)}</strong> was paid. Cancelling does not refund it. Please refund it from your PayPal dashboard, then mark it refunded here.
              </span>
            </div>
          ) : (
            <p>
              The table for {cancelling?.full_name} will be released straight away.
            </p>
          )
        }
        onCancel={() => setCancelling(null)}
        onConfirm={() => cancelling && void update(cancelling, { status: 'cancelled' }, 'Reservation cancelled')}
      />
    </>
  )
}
