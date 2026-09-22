import { useState, type FormEvent } from 'react'
import { CalendarOff, Plus, Trash2 } from 'lucide-react'
import { AdminPageHead } from '../../components/admin'
import { ConfirmDialog } from '../../components/ui/Sheet'
import { EmptyState, ErrorState, Field, Skeleton } from '../../components/ui/primitives'
import { useRequiredSettings } from '../../context/SettingsContext'
import { useToast } from '../../context/ToastContext'
import { useAsync } from '../../hooks/useAsync'
import { errorMessage, unwrap } from '../../lib/errors'
import { formatDateOnly } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import type { BlockedDate } from '../../lib/types'
import { isValidDateString, zonedNow } from '../../../supabase/functions/_shared/rules'

export default function BlockedDatesPage() {
  const settings = useRequiredSettings()
  const toast = useToast()
  const [date, setDate] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [removing, setRemoving] = useState<BlockedDate | null>(null)
  const today = zonedNow(settings.timezone).date

  const state = useAsync(async () => unwrap<BlockedDate[]>(await supabase.from('blocked_dates').select('*').order('blocked_date', { ascending: true })), [])

  const add = async (event: FormEvent) => {
    event.preventDefault()
    if (!isValidDateString(date)) return toast.error('Please pick a date.')
    setBusy(true)
    try {
      unwrap(await supabase.from('blocked_dates').insert({ blocked_date: date, reason: reason.trim() || null }))
      toast.success(`${formatDateOnly(date)} is now blocked. Guests can no longer book that day.`)
      setDate('')
      setReason('')
      state.reload()
    } catch (failure) {
      const message = errorMessage(failure)
      toast.error(/already exists|duplicate|unique/i.test(message) ? 'That date is already blocked.' : message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!removing) return
    setBusy(true)
    try {
      unwrap(await supabase.from('blocked_dates').delete().eq('id', removing.id))
      toast.success('Date unblocked')
      setRemoving(null)
      state.reload()
    } catch (failure) {
      toast.error(errorMessage(failure))
    } finally {
      setBusy(false)
    }
  }

  const upcoming = (state.data ?? []).filter((entry) => entry.blocked_date >= today)
  const past = (state.data ?? []).filter((entry) => entry.blocked_date < today)

  const renderRow = (entry: BlockedDate) => (
    <li key={entry.id} className="blocked__row">
      <span className="blocked__date">
        <strong>{formatDateOnly(entry.blocked_date)}</strong>
        <small>{entry.reason || 'No reason given'}</small>
      </span>
      <button type="button" className="btn btn--danger-ghost btn--sm" onClick={() => setRemoving(entry)}>
        <Trash2 size={15} /> Remove
      </button>
    </li>
  )

  return (
    <>
      <AdminPageHead title="Blocked Dates" subtitle="Block a date (a private event, a holiday) so guests cannot reserve it." />

      <form className="card card--pad blocked__form" onSubmit={add}>
        <Field label="Date" htmlFor="bd-date">
          <input id="bd-date" type="date" className="input" min={today} value={date} onChange={(event) => setDate(event.target.value)} required />
        </Field>
        <Field label="Reason" htmlFor="bd-reason">
          <input id="bd-reason" className="input" placeholder="e.g. Private event" value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
        <button type="submit" className="btn btn--gold blocked__add" disabled={busy}>
          <Plus size={17} /> Block date
        </button>
      </form>

      {state.error ? (
        <ErrorState message={state.error} onRetry={state.reload} />
      ) : !state.data ? (
        <Skeleton style={{ height: 160, borderRadius: 22 }} />
      ) : state.data.length === 0 ? (
        <EmptyState icon={<CalendarOff size={28} />} title="No blocked dates" text="Every open day can currently be booked." />
      ) : (
        <>
          {upcoming.length > 0 && (
            <section>
              <h3 className="blocked__h">Upcoming</h3>
              <ul className="card blocked__list">{upcoming.map(renderRow)}</ul>
            </section>
          )}
          {past.length > 0 && (
            <section>
              <h3 className="blocked__h">Past</h3>
              <ul className="card blocked__list blocked__list--past">{[...past].reverse().map(renderRow)}</ul>
            </section>
          )}
        </>
      )}

      <ConfirmDialog
        open={Boolean(removing)}
        danger
        title="Remove blocked date?"
        confirmLabel="Remove"
        busy={busy}
        message={<p>{removing ? `${formatDateOnly(removing.blocked_date)} will open for reservations again.` : ''}</p>}
        onCancel={() => setRemoving(null)}
        onConfirm={() => void remove()}
      />
    </>
  )
}
