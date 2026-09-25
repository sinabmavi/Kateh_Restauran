import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { Cake, CalendarClock, Copy, Pencil, Play, Repeat, Send, Trash2, X } from 'lucide-react'
import { ConfirmDialog } from '../../../../components/ui/Sheet'
import { EmptyState, Switch } from '../../../../components/ui/primitives'
import { useRequiredSettings } from '../../../../context/SettingsContext'
import { useToast } from '../../../../context/ToastContext'
import { marketingRunNow, marketingSendNow } from '../../../../lib/api'
import { isReachable, type ClubCustomer } from '../../../../lib/club'
import { errorMessage, unwrap } from '../../../../lib/errors'
import type { MarketingEmailRow } from '../../../../lib/marketing'
import { supabase } from '../../../../lib/supabase'
import { REPEAT_LABELS, describeAudience, describeSchedule, nextRunAt, resolveAudience, type Schedule } from '../../../../../supabase/functions/_shared/marketing.ts'
import { addDaysToDateString, zonedNow } from '../../../../../supabase/functions/_shared/rules'
import { birthdayDraft, draftFromRow, type ComposerDraft } from './Composer'

interface ScheduledTabProps {
  emails: MarketingEmailRow[]
  customers: ClubCustomer[]
  onEdit: (draft: ComposerDraft) => void
  onChanged: () => void
}

interface Confirm {
  title: string
  text: string
  label: string
  danger?: boolean
  run: () => Promise<void>
}

const scheduleOf = (row: MarketingEmailRow): Schedule => ({ frequency: row.frequency ?? 'daily', send_time: row.send_time ?? '10:00', weekdays: row.weekdays, month_day: row.month_day })

export function ScheduledTab({ emails, customers, onEdit, onChanged }: ScheduledTabProps) {
  const settings = useRequiredSettings()
  const toast = useToast()
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [busy, setBusy] = useState(false)

  const birthday = emails.find((row) => row.preset === 'birthday')
  const automatic = emails.filter((row) => row.mode === 'automatic' && row.preset !== 'birthday')
  const scheduled = emails.filter((row) => row.status === 'scheduled')
  const daysBefore = birthday?.audience.filters?.birthday?.when === 'in_days' ? (birthday.audience.filters.birthday.days ?? 0) : 0

  const upcoming = useMemo(
    () =>
      [
        ...scheduled.map((row) => ({ row, at: row.send_at })),
        ...emails.filter((row) => row.mode === 'automatic' && row.status === 'active' && row.next_run_at).map((row) => ({ row, at: row.next_run_at })),
      ]
        .filter((entry): entry is { row: MarketingEmailRow; at: string } => Boolean(entry.at))
        .sort((a, b) => a.at.localeCompare(b.at)),
    [emails, scheduled],
  )

  const birthdays = useMemo(() => {
    const today = zonedNow(settings.timezone).date
    const list: Array<{ customer: ClubCustomer; date: string; send: string }> = []
    for (const customer of customers) {
      if (!customer.birthday || !isReachable(customer)) continue
      for (let offset = 0; offset < 30 + daysBefore; offset++) {
        const date = addDaysToDateString(today, offset)
        if (date.slice(5) === customer.birthday.slice(5, 10)) {
          const send = addDaysToDateString(date, -daysBefore)
          if (send >= today && offset - daysBefore < 30) list.push({ customer, date, send })
          break
        }
      }
    }
    return list.sort((a, b) => a.send.localeCompare(b.send))
  }, [customers, settings.timezone, daysBefore])

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    try {
      await action()
      setConfirm(null)
      onChanged()
    } catch (failure) {
      toast.error(errorMessage(failure))
    } finally {
      setBusy(false)
    }
  }

  const setActive = (row: MarketingEmailRow, active: boolean) =>
    run(async () => {
      const next = active ? nextRunAt(scheduleOf(row), settings.timezone) : null
      unwrap(await supabase.from('marketing_emails').update({ status: active ? 'active' : 'paused', next_run_at: next?.toISOString() ?? null, updated_at: new Date().toISOString() }).eq('id', row.id))
      toast.success(active ? `“${row.name}” is on` : `“${row.name}” is paused`)
    })

  const updateBirthday = (patch: { send_time?: string; daysBefore?: number }) =>
    birthday &&
    run(async () => {
      const schedule = { ...scheduleOf(birthday), send_time: patch.send_time ?? birthday.send_time ?? '09:00' }
      const days = patch.daysBefore ?? daysBefore
      const audience = { ...birthday.audience, mode: 'filtered' as const, filters: { ...birthday.audience.filters, birthday: days ? { when: 'in_days' as const, days } : { when: 'today' as const } } }
      unwrap(
        await supabase
          .from('marketing_emails')
          .update({ send_time: schedule.send_time, audience, next_run_at: birthday.status === 'active' ? (nextRunAt(schedule, settings.timezone)?.toISOString() ?? null) : null, updated_at: new Date().toISOString() })
          .eq('id', birthday.id),
      )
      toast.success('Birthday email updated')
    })

  const runNow = (row: MarketingEmailRow) =>
    setConfirm({
      title: `Run “${row.name}” now?`,
      text: `It goes to ${describeAudience(row.audience).toLowerCase()} (${resolveAudience(customers, row.audience, settings.timezone).length} right now), skipping anyone who already got it (${REPEAT_LABELS[row.repeat_policy].toLowerCase()}).`,
      label: 'Run now',
      run: async () => {
        const result = await marketingRunNow(row.id)
        if (result.firstError && result.sent === 0) toast.error(`Not sent: ${result.firstError}`)
        else toast.success(result.recipients === 0 ? 'Nobody new to send to right now.' : `Sent to ${result.sent}${result.failed ? `, ${result.failed} failed` : ''}.`)
      },
    })

  const remove = (row: MarketingEmailRow) =>
    setConfirm({
      title: `Delete “${row.name}”?`,
      text: 'It stops and is removed. Emails already sent stay in History.',
      label: 'Delete',
      danger: true,
      run: async () => {
        unwrap(await supabase.from('marketing_emails').delete().eq('id', row.id))
        toast.success('Deleted')
      },
    })

  const duplicate = (row: MarketingEmailRow) => onEdit(draftFromRow(row, true))

  return (
    <div className="mk-stack">
      {/* ----------------------------------------------------- birthday */}
      <section className="mk-card mk-bday">
        <header className="mk-bday__head">
          <span className="mk-type__icon">
            <Cake size={20} />
          </span>
          <div>
            <h3 className="mk-h">Birthday email</h3>
            <p className="muted-note">Sent automatically to every customer on their birthday, once a year.</p>
          </div>
          {birthday && <Switch checked={birthday.status === 'active'} onChange={(on) => void setActive(birthday, on)} label="Birthday email on" />}
        </header>

        {!birthday ? (
          <button type="button" className="btn btn--gold" onClick={() => onEdit(birthdayDraft())}>
            <Cake size={16} /> Set up birthday email
          </button>
        ) : (
          <>
            <div className="form-grid form-grid--2">
              <label className="mk-field">
                <span>Send at</span>
                <input type="time" className="input" defaultValue={birthday.send_time ?? '09:00'} onBlur={(event) => event.target.value && event.target.value !== birthday.send_time && void updateBirthday({ send_time: event.target.value })} />
              </label>
              <label className="mk-field">
                <span>Send</span>
                <select className="select" value={daysBefore} onChange={(event) => void updateBirthday({ daysBefore: Number(event.target.value) })}>
                  <option value={0}>On the birthday</option>
                  <option value={1}>1 day before</option>
                  <option value={3}>3 days before</option>
                  <option value={7}>7 days before</option>
                </select>
              </label>
            </div>
            <div className="mk-row-actions">
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => onEdit(draftFromRow(birthday))}>
                <Pencil size={14} /> Edit message
              </button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => runNow(birthday)}>
                <Play size={14} /> Run now
              </button>
              {birthday.status === 'active' && birthday.next_run_at && <span className="muted-note">Next check {format(new Date(birthday.next_run_at), 'EEE d MMM, h:mm a')}</span>}
            </div>
            <div className="mk-bday__list">
              <h4>Next 30 days</h4>
              {birthdays.length === 0 ? (
                <p className="muted-note">No subscribed customers have a birthday in the next 30 days.</p>
              ) : (
                <ul>
                  {birthdays.slice(0, 12).map(({ customer, date, send }) => (
                    <li key={customer.user_id}>
                      <strong>{customer.full_name || customer.email}</strong>
                      <span>
                        {format(new Date(`${date}T12:00:00`), 'd MMM')}
                        {send !== date && ` · email ${format(new Date(`${send}T12:00:00`), 'd MMM')}`}
                      </span>
                    </li>
                  ))}
                  {birthdays.length > 12 && <li className="muted-note">and {birthdays.length - 12} more</li>}
                </ul>
              )}
            </div>
          </>
        )}
      </section>

      {/* ----------------------------------------------------- upcoming */}
      <section className="mk-stack">
        <h3 className="mk-h">Coming up</h3>
        {upcoming.length === 0 ? (
          <EmptyState icon={<CalendarClock size={26} />} title="Nothing scheduled" text="Scheduled and automatic emails appear here in date order." />
        ) : (
          <ul className="mk-list">
            {upcoming.map(({ row, at }) => (
              <li key={`${row.id}-${at}`} className="mk-item">
                <div className="mk-item__date">
                  <strong>{format(new Date(at), 'd MMM')}</strong>
                  <span>{format(new Date(at), 'h:mm a')}</span>
                </div>
                <div className="mk-item__body">
                  <strong>{row.name}</strong>
                  <small>
                    {row.mode === 'automatic' ? 'Automatic' : 'Scheduled'} · {describeAudience(row.audience)}
                  </small>
                </div>
                <div className="mk-item__actions">
                  {row.mode === 'scheduled' ? (
                    <>
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => onEdit(draftFromRow(row))} aria-label="Edit">
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        aria-label="Send now"
                        onClick={() =>
                          setConfirm({
                            title: `Send “${row.name}” now?`,
                            text: 'It goes out right away instead of at the scheduled time.',
                            label: 'Send now',
                            run: async () => {
                              const result = await marketingSendNow(row.id)
                              if (result.firstError && result.sent === 0) toast.error(`Not sent: ${result.firstError}`)
                              else toast.success(`Sent to ${result.sent}.`)
                            },
                          })
                        }
                      >
                        <Send size={14} />
                      </button>
                      <button
                        type="button"
                        className="btn btn--danger-ghost btn--sm"
                        aria-label="Cancel"
                        onClick={() =>
                          setConfirm({
                            title: `Cancel “${row.name}”?`,
                            text: 'It will not be sent.',
                            label: 'Cancel email',
                            danger: true,
                            run: async () => {
                              unwrap(await supabase.from('marketing_emails').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', row.id).eq('status', 'scheduled'))
                              toast.success('Cancelled')
                            },
                          })
                        }
                      >
                        <X size={14} />
                      </button>
                    </>
                  ) : (
                    <button type="button" className="btn btn--ghost btn--sm" onClick={() => onEdit(draftFromRow(row))} aria-label="Edit">
                      <Pencil size={14} />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ----------------------------------------------------- automatic */}
      <section className="mk-stack">
        <h3 className="mk-h">Automatic emails</h3>
        {automatic.length === 0 ? (
          <EmptyState icon={<Repeat size={26} />} title="No automatic emails yet" text="Create an email and choose “Automatically” in the last step." />
        ) : (
          <ul className="mk-list">
            {automatic.map((row) => (
              <li key={row.id} className={`mk-item mk-item--auto${row.status === 'paused' ? ' is-paused' : ''}`}>
                <div className="mk-item__body">
                  <strong>{row.name}</strong>
                  <small>
                    {describeSchedule(scheduleOf(row))} · {describeAudience(row.audience)}
                  </small>
                  <small>
                    {REPEAT_LABELS[row.repeat_policy]} ·{' '}
                    {row.status === 'active' && row.next_run_at ? `next ${format(new Date(row.next_run_at), 'EEE d MMM, h:mm a')}` : 'paused'}
                    {row.last_run_at && ` · last ran ${format(new Date(row.last_run_at), 'd MMM')}`}
                  </small>
                </div>
                <div className="mk-item__actions">
                  <Switch checked={row.status === 'active'} onChange={(on) => void setActive(row, on)} label={`${row.name} on`} />
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => onEdit(draftFromRow(row))} aria-label="Edit">
                    <Pencil size={14} />
                  </button>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => runNow(row)} aria-label="Run now">
                    <Play size={14} />
                  </button>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => duplicate(row)} aria-label="Duplicate">
                    <Copy size={14} />
                  </button>
                  <button type="button" className="btn btn--danger-ghost btn--sm" onClick={() => remove(row)} aria-label="Delete">
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={Boolean(confirm)}
        danger={confirm?.danger}
        title={confirm?.title ?? ''}
        confirmLabel={confirm?.label}
        busy={busy}
        message={<p>{confirm?.text}</p>}
        onCancel={() => setConfirm(null)}
        onConfirm={() => confirm && void run(confirm.run)}
      />
    </div>
  )
}
