import { useEffect, useState } from 'react'
import { Copy } from 'lucide-react'
import { AdminPageHead } from '../../components/admin'
import { Switch } from '../../components/ui/primitives'
import { useSettings } from '../../context/SettingsContext'
import { useToast } from '../../context/ToastContext'
import { errorMessage, unwrap } from '../../lib/errors'
import { WEEKDAY_NAMES, WEEKDAY_ORDER } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import { minutesToTime, parseTimeToMinutes } from '../../../supabase/functions/_shared/rules'

interface DayDraft {
  is_open: boolean
  start: string
  end: string
}

const toInput = (time: string) => time.slice(0, 5)

export default function BusinessHoursPage() {
  const { hours, reload } = useSettings()
  const toast = useToast()
  const [days, setDays] = useState<Record<number, DayDraft>>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const next: Record<number, DayDraft> = {}
    for (const row of hours) next[row.weekday] = { is_open: row.is_open, start: toInput(row.start_time), end: toInput(row.end_time) }
    setDays(next)
  }, [hours])

  const patch = (weekday: number, change: Partial<DayDraft>) => setDays((current) => ({ ...current, [weekday]: { ...current[weekday], ...change } }))

  const copyToAll = (weekday: number) => {
    const source = days[weekday]
    setDays((current) => Object.fromEntries(Object.entries(current).map(([key, value]) => [key, { ...value, ...source }])))
    toast.info(`${WEEKDAY_NAMES[weekday]}'s hours copied to every day. Save to apply.`)
  }

  const dirty = hours.some((row) => {
    const draft = days[row.weekday]
    return draft && (draft.is_open !== row.is_open || draft.start !== toInput(row.start_time) || draft.end !== toInput(row.end_time))
  })

  const save = async () => {
    for (const row of hours) {
      const draft = days[row.weekday]
      if (!draft) continue
      const start = parseTimeToMinutes(draft.start)
      const end = parseTimeToMinutes(draft.end)
      if (start === null || end === null) return toast.error(`Please enter opening and closing times for ${WEEKDAY_NAMES[row.weekday]}.`)
      if (draft.is_open && end <= start) return toast.error(`${WEEKDAY_NAMES[row.weekday]}: closing time must be after opening time.`)
    }

    setBusy(true)
    try {
      for (const row of hours) {
        const draft = days[row.weekday]
        if (!draft) continue
        // Closed days keep their times so re-opening a day starts from sensible values.
        unwrap(
          await supabase
            .from('business_hours')
            .update({ is_open: draft.is_open, start_time: minutesToTime(parseTimeToMinutes(draft.start) ?? 0), end_time: minutesToTime(parseTimeToMinutes(draft.end) ?? 0) })
            .eq('id', row.id),
        )
      }
      await reload()
      toast.success('Opening hours saved. Availability has updated.')
    } catch (failure) {
      toast.error(errorMessage(failure))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <AdminPageHead
        title="Business Hours"
        subtitle="Guests can only book inside these hours, and the last table must finish before closing."
        actions={
          <button type="button" className="btn btn--gold" disabled={busy || !dirty} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        }
      />

      <div className="card hours-editor">
        {WEEKDAY_ORDER.map((weekday) => {
          const draft = days[weekday]
          if (!draft) return null
          return (
            <div key={weekday} className={`hours-editor__row${draft.is_open ? '' : ' is-closed'}`}>
              <div className="hours-editor__day">
                <Switch checked={draft.is_open} onChange={(value) => patch(weekday, { is_open: value })} label={`${WEEKDAY_NAMES[weekday]} open`} />
                <div>
                  <strong>{WEEKDAY_NAMES[weekday]}</strong>
                  <span className="muted-note">{draft.is_open ? 'Open' : 'Closed'}</span>
                </div>
              </div>
              <div className="hours-editor__times">
                <label>
                  <span className="visually-hidden">Opens</span>
                  <input type="time" step={900} className="input" value={draft.start} disabled={!draft.is_open} onChange={(event) => patch(weekday, { start: event.target.value })} />
                </label>
                <span aria-hidden>to</span>
                <label>
                  <span className="visually-hidden">Closes</span>
                  <input type="time" step={900} className="input" value={draft.end} disabled={!draft.is_open} onChange={(event) => patch(weekday, { end: event.target.value })} />
                </label>
              </div>
              <button type="button" className="btn btn--ghost btn--sm hours-editor__copy" onClick={() => copyToAll(weekday)}>
                <Copy size={14} /> Copy to all days
              </button>
            </div>
          )
        })}
      </div>
    </>
  )
}
