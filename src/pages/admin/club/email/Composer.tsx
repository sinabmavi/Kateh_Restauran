import { useMemo, useRef, useState, type ReactNode } from 'react'
import { format } from 'date-fns'
import {
  ArrowLeft,
  ArrowRight,
  BadgePercent,
  Cake,
  CalendarClock,
  CalendarHeart,
  Check,
  CircleAlert,
  Eye,
  FilePlus2,
  Heart,
  Hourglass,
  Megaphone,
  PartyPopper,
  Percent,
  Repeat,
  Save,
  Send,
  Sparkles,
  UtensilsCrossed,
  Zap,
} from 'lucide-react'
import { ConfirmDialog, Sheet } from '../../../../components/ui/Sheet'
import { Field, Switch } from '../../../../components/ui/primitives'
import { useAuth } from '../../../../context/AuthContext'
import { useRequiredSettings } from '../../../../context/SettingsContext'
import { useToast } from '../../../../context/ToastContext'
import { useAsync } from '../../../../hooks/useAsync'
import { marketingSendNow, marketingSendTest } from '../../../../lib/api'
import { isReachable, type ClubCustomer } from '../../../../lib/club'
import { errorMessage, unwrap } from '../../../../lib/errors'
import {
  MESSAGE_TYPES,
  blockingProblems,
  cloneMessage,
  contentChecks,
  type Audience,
  type EmailMessage,
  type MarketingEmailRow,
  type MarketingSettingsRow,
  type MarketingTemplate,
  type RepeatPolicy,
  type Schedule,
} from '../../../../lib/marketing'
import { supabase } from '../../../../lib/supabase'
import { ImageUpload } from '../../ImageUpload'
import { AudienceStep } from './AudienceStep'
import { PreviewSheet } from './PreviewSheet'
import { PERSONAL_TAGS, REPEAT_LABELS, WEEKDAY_SHORT, describeAudience, describeSchedule, nextRunAt, resolveAudience } from '../../../../../supabase/functions/_shared/marketing.ts'

/* ----------------------------------------------------------------- drafts */

export type Delivery = 'now' | 'scheduled' | 'automatic'

export interface ComposerDraft {
  id: string | null
  preset: string | null
  step: 1 | 2 | 3 | 4
  name: string
  message: EmailMessage | null
  audience: Audience
  delivery: Delivery
  sendAt: string
  schedule: Schedule
  repeat: RepeatPolicy
}

const DEFAULT_SCHEDULE: Schedule = { frequency: 'daily', send_time: '10:00', weekdays: [1, 4], month_day: 1 }

export function newDraft(audience?: Audience): ComposerDraft {
  return { id: null, preset: null, step: 1, name: '', message: null, audience: audience ?? { mode: 'all' }, delivery: 'now', sendAt: '', schedule: DEFAULT_SCHEDULE, repeat: 'every_run' }
}

export function birthdayDraft(daysBefore = 0, sendTime = '09:00'): ComposerDraft {
  return {
    ...newDraft(),
    preset: 'birthday',
    step: 2,
    name: 'Birthday greeting',
    message: cloneMessage(MESSAGE_TYPES.find((type) => type.key === 'birthday')!.message),
    audience: { mode: 'filtered', filters: { birthday: daysBefore ? { when: 'in_days', days: daysBefore } : { when: 'today' } } },
    delivery: 'automatic',
    schedule: { frequency: 'daily', send_time: sendTime },
    repeat: 'yearly',
  }
}

export function draftFromRow(row: MarketingEmailRow, copy = false): ComposerDraft {
  return {
    id: copy ? null : row.id,
    preset: copy ? null : row.preset,
    step: 2,
    name: copy ? `${row.name} (copy)` : row.name,
    message: cloneMessage(row.message),
    audience: row.audience,
    delivery: row.mode,
    sendAt: row.send_at ? format(new Date(row.send_at), "yyyy-MM-dd'T'HH:mm") : '',
    schedule: { frequency: row.frequency ?? 'daily', send_time: row.send_time ?? '10:00', weekdays: row.weekdays ?? [1, 4], month_day: row.month_day ?? 1 },
    repeat: row.repeat_policy,
  }
}

const TYPE_ICONS: Record<string, typeof Cake> = {
  birthday: Cake,
  offer: BadgePercent,
  discount: Percent,
  welcome: PartyPopper,
  new_menu: UtensilsCrossed,
  event: CalendarHeart,
  winback: Hourglass,
  holiday: Sparkles,
  thanks: Heart,
  announcement: Megaphone,
  blank: FilePlus2,
}

const STEPS = ['Type', 'Content', 'Customers', 'Send']

/* --------------------------------------------------------- field with tags */

interface TagFieldProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  onActivate: (insert: (tag: string) => void) => void
  multiline?: boolean
  rows?: number
  hint?: string
  placeholder?: string
  maxLength?: number
}

function TagField({ id, label, value, onChange, onActivate, multiline, rows = 4, hint, placeholder, maxLength }: TagFieldProps) {
  const input = useRef<HTMLInputElement>(null)
  const area = useRef<HTMLTextAreaElement>(null)
  const insert = (tag: string) => {
    const element = multiline ? area.current : input.current
    const start = element?.selectionStart ?? value.length
    const end = element?.selectionEnd ?? value.length
    onChange(value.slice(0, start) + tag + value.slice(end))
    requestAnimationFrame(() => {
      element?.focus()
      element?.setSelectionRange(start + tag.length, start + tag.length)
    })
  }
  return (
    <Field label={label} htmlFor={id} hint={hint}>
      {multiline ? (
        <textarea id={id} ref={area} className="textarea" rows={rows} value={value} placeholder={placeholder} maxLength={maxLength} onFocus={() => onActivate(insert)} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input id={id} ref={input} className="input" value={value} placeholder={placeholder} maxLength={maxLength} onFocus={() => onActivate(insert)} onChange={(event) => onChange(event.target.value)} />
      )}
    </Field>
  )
}

function Section({ title, toggle, children }: { title: string; toggle?: { on: boolean; set: (on: boolean) => void }; children?: ReactNode }) {
  return (
    <section className={`mk-card mk-section${toggle && !toggle.on ? ' is-off' : ''}`}>
      <header className="mk-section__head">
        <h4>{title}</h4>
        {toggle && <Switch checked={toggle.on} onChange={toggle.set} label={`Show ${title.toLowerCase()}`} />}
      </header>
      {(!toggle || toggle.on) && <div className="mk-section__body">{children}</div>}
    </section>
  )
}

/* ------------------------------------------------------------------ composer */

interface ComposerProps {
  draft: ComposerDraft
  setDraft: (update: (current: ComposerDraft) => ComposerDraft) => void
  customers: ClubCustomer[]
  templates: MarketingTemplate[]
  marketingSettings: MarketingSettingsRow | null
  onTemplatesChanged: () => void
  onFinished: (tab: 'history' | 'scheduled') => void
}

export function Composer({ draft, setDraft, customers, templates, marketingSettings, onTemplatesChanged, onFinished }: ComposerProps) {
  const settings = useRequiredSettings()
  const { user } = useAuth()
  const toast = useToast()
  const [preview, setPreview] = useState(false)
  const [busy, setBusy] = useState(false)
  const [testing, setTesting] = useState(false)
  const [confirmSend, setConfirmSend] = useState(false)
  const [saveName, setSaveName] = useState<string | null>(null)
  const insertRef = useRef<((tag: string) => void) | null>(null)
  const top = useRef<HTMLDivElement>(null)

  const skipDays = draft.audience.skipRecentDays ?? null
  const recent = useAsync(async () => {
    if (!skipDays) return new Set<string>()
    const since = new Date(Date.now() - skipDays * 86_400_000).toISOString()
    const rows = unwrap<Array<{ user_id: string | null }>>(await supabase.from('marketing_sends').select('user_id').eq('status', 'sent').gte('sent_at', since).limit(20_000))
    return new Set(rows.map((row) => row.user_id).filter((id): id is string => Boolean(id)))
  }, [skipDays])
  const recentlyEmailed = useMemo(() => recent.data ?? new Set<string>(), [recent.data])
  const recipients = useMemo(() => resolveAudience(customers, draft.audience, settings.timezone, recentlyEmailed), [customers, draft.audience, settings.timezone, recentlyEmailed])

  const message = draft.message
  const patch = (next: Partial<ComposerDraft>) => setDraft((current) => ({ ...current, ...next }))
  const patchMessage = (update: (current: EmailMessage) => EmailMessage) => setDraft((current) => (current.message ? { ...current, message: update(current.message) } : current))
  const goTo = (step: ComposerDraft['step']) => {
    patch({ step })
    requestAnimationFrame(() => top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
  const activate = (insert: (tag: string) => void) => {
    insertRef.current = insert
  }

  const pickType = (source: EmailMessage, name: string) => {
    setDraft((current) => ({ ...current, message: cloneMessage(source), name: current.name || name }))
    goTo(2)
  }

  const next = () => {
    if (draft.step === 2 && message) {
      const problems = blockingProblems(message)
      if (problems.length) return toast.error(problems[0]!)
    }
    goTo((draft.step + 1) as ComposerDraft['step'])
  }

  const sendTest = async () => {
    if (!message) return
    setTesting(true)
    try {
      const { results } = await marketingSendTest(message)
      const failed = results.filter((result) => !result.ok)
      if (failed.length) toast.error(`Test not sent to ${failed[0]!.to}: ${failed[0]!.error}`)
      else toast.success(`Test sent to ${results.map((result) => result.to).join(', ')}. Check the inbox and the spam folder.`)
    } catch (failure) {
      toast.error(errorMessage(failure))
    } finally {
      setTesting(false)
    }
  }

  const saveTemplate = async () => {
    if (!message || !saveName || saveName.trim().length < 2) return toast.error('Please give it a name.')
    try {
      unwrap(await supabase.from('marketing_templates').insert({ name: saveName.trim(), message }))
      toast.success('Saved to My messages')
      setSaveName(null)
      onTemplatesChanged()
    } catch (failure) {
      toast.error(errorMessage(failure))
    }
  }

  const row = () => ({
    name: draft.name.trim() || message!.subject.trim() || 'Untitled email',
    message: message!,
    audience: draft.audience,
    mode: draft.delivery,
    preset: draft.preset,
    updated_at: new Date().toISOString(),
  })

  const submit = async () => {
    if (!message) return
    const problems = blockingProblems(message)
    if (problems.length) {
      goTo(2)
      return toast.error(problems[0]!)
    }

    if (draft.delivery === 'automatic') {
      if (draft.audience.mode === 'selected') return toast.error('Automatic emails need “Everyone” or “Filter customers” in step 3.')
      if (draft.schedule.frequency === 'weekdays' && !draft.schedule.weekdays?.length) return toast.error('Choose at least one day.')
      const next = nextRunAt(draft.schedule, settings.timezone)
      setBusy(true)
      try {
        const values = {
          ...row(),
          status: 'active',
          frequency: draft.schedule.frequency,
          weekdays: draft.schedule.frequency === 'weekdays' ? draft.schedule.weekdays : null,
          month_day: draft.schedule.frequency === 'monthly' ? draft.schedule.month_day : null,
          send_time: draft.schedule.send_time,
          repeat_policy: draft.repeat,
          next_run_at: next?.toISOString() ?? null,
          send_at: null,
        }
        unwrap(draft.id ? await supabase.from('marketing_emails').update(values).eq('id', draft.id) : await supabase.from('marketing_emails').insert({ ...values, created_by: user?.id ?? null }))
        toast.success(`${draft.id ? 'Updated' : 'Started'}: ${describeSchedule(draft.schedule)}.`)
        onFinished('scheduled')
      } catch (failure) {
        toast.error(errorMessage(failure))
      } finally {
        setBusy(false)
      }
      return
    }

    if (recipients.length === 0) return toast.error('Nobody matches these customers yet. Go back to step 3.')

    if (draft.delivery === 'scheduled') {
      const at = draft.sendAt ? new Date(draft.sendAt) : null
      if (!at || Number.isNaN(at.getTime()) || at.getTime() < Date.now() + 60_000) return toast.error('Please choose a time in the future.')
      setBusy(true)
      try {
        const values = { ...row(), status: 'scheduled', send_at: at.toISOString(), frequency: null, weekdays: null, month_day: null, send_time: null, next_run_at: null }
        unwrap(draft.id ? await supabase.from('marketing_emails').update(values).eq('id', draft.id) : await supabase.from('marketing_emails').insert({ ...values, created_by: user?.id ?? null }))
        toast.success(`Scheduled for ${format(at, 'EEE d MMM, h:mm a')}`)
        onFinished('scheduled')
      } catch (failure) {
        toast.error(errorMessage(failure))
      } finally {
        setBusy(false)
      }
      return
    }

    setConfirmSend(true)
  }

  const sendNow = async () => {
    setBusy(true)
    try {
      const created = unwrap<{ id: string }>(await supabase.from('marketing_emails').insert({ ...row(), status: 'draft', created_by: user?.id ?? null }).select('id').single())
      const result = await marketingSendNow(created.id)
      setConfirmSend(false)
      if (result.firstError && result.sent === 0) toast.error(`Not sent: ${result.firstError}`)
      else if (result.sent < result.recipients) toast.success(`${result.sent} of ${result.recipients} sent so far. The rest go out over the next minutes.`)
      else toast.success(`Sent to ${result.sent} ${result.sent === 1 ? 'customer' : 'customers'}.`)
      onFinished('history')
    } catch (failure) {
      toast.error(errorMessage(failure))
    } finally {
      setBusy(false)
    }
  }

  const checks = message ? contentChecks(message) : []
  const firstRun = draft.delivery === 'automatic' ? nextRunAt(draft.schedule, settings.timezone) : null
  const sample = recipients[0]?.full_name ?? customers.find(isReachable)?.full_name ?? null

  const finalLabel = busy
    ? 'Working…'
    : draft.delivery === 'automatic'
      ? draft.id
        ? 'Save automatic email'
        : 'Start automatic email'
      : draft.delivery === 'scheduled'
        ? draft.id
          ? 'Save schedule'
          : 'Schedule email'
        : `Send to ${recipients.length}`

  return (
    <div className="mk-composer">
      <div ref={top} className="mk-anchor" />

      <ol className="mk-steps" aria-label="Steps">
        {STEPS.map((label, index) => {
          const number = (index + 1) as ComposerDraft['step']
          const done = draft.step > number
          const clickable = number < draft.step || (number > 1 && message !== null && number <= draft.step)
          return (
            <li key={label} className={`mk-steps__item${draft.step === number ? ' is-active' : ''}${done ? ' is-done' : ''}`}>
              <button type="button" disabled={!clickable} onClick={() => goTo(number)} aria-current={draft.step === number ? 'step' : undefined}>
                <span className="mk-steps__dot">{done ? <Check size={13} strokeWidth={3} /> : number}</span>
                <span className="mk-steps__label">{label}</span>
              </button>
            </li>
          )
        })}
      </ol>

      {draft.id && (
        <p className="notice notice--info mk-editing">
          Editing “{draft.name}”.
        </p>
      )}

      {/* ---------------------------------------------------------- step 1 */}
      {draft.step === 1 && (
        <div className="mk-stack">
          <div>
            <h3 className="mk-h">What kind of email?</h3>
            <p className="muted-note">Pick one. It comes filled in, so you only change what you need.</p>
          </div>
          <div className="mk-types">
            {MESSAGE_TYPES.map((type) => {
              const Icon = TYPE_ICONS[type.key] ?? FilePlus2
              return (
                <button key={type.key} type="button" className={`mk-type${message?.type === type.key ? ' is-active' : ''}`} onClick={() => pickType(type.message, type.name)}>
                  <span className="mk-type__icon">
                    <Icon size={20} />
                  </span>
                  <strong>{type.name}</strong>
                  <small>{type.description}</small>
                </button>
              )
            })}
          </div>
          {templates.length > 0 && (
            <>
              <h3 className="mk-h mk-h--sub">My messages</h3>
              <div className="mk-types">
                {templates.map((template) => (
                  <button key={template.id} type="button" className="mk-type mk-type--saved" onClick={() => pickType(template.message, template.name)}>
                    <span className="mk-type__icon">
                      <Save size={18} />
                    </span>
                    <strong>{template.name}</strong>
                    <small>{template.message.subject || 'No subject'}</small>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ---------------------------------------------------------- step 2 */}
      {draft.step === 2 && message && (
        <div className="mk-stack">
          <div className="mk-tags" aria-label="Personalise">
            <span>Personalise:</span>
            {PERSONAL_TAGS.map((entry) => (
              <button
                key={entry.tag}
                type="button"
                className="mk-tag"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => (insertRef.current ? insertRef.current(entry.tag) : toast.info('Tap a text box first, then add a name.'))}
              >
                + {entry.label}
              </button>
            ))}
          </div>

          <Section title="Inbox">
            <TagField id="mk-subject" label="Subject line" value={message.subject} maxLength={150} onActivate={activate} onChange={(subject) => patchMessage((m) => ({ ...m, subject }))} hint={`${message.subject.length} characters · under 60 reads best on phones`} />
            <TagField id="mk-preheader" label="Preview text" value={message.preheader} maxLength={180} onActivate={activate} onChange={(preheader) => patchMessage((m) => ({ ...m, preheader }))} hint="The short line shown after the subject." />
          </Section>

          <Section title="Heading">
            <TagField id="mk-eyebrow" label="Small label above the title" value={message.eyebrow} maxLength={40} onActivate={activate} onChange={(eyebrow) => patchMessage((m) => ({ ...m, eyebrow }))} placeholder="e.g. Exclusive offer" />
            <TagField id="mk-title" label="Title" value={message.title} maxLength={90} onActivate={activate} onChange={(title) => patchMessage((m) => ({ ...m, title }))} />
            <TagField id="mk-subtitle" label="Subtitle (optional)" value={message.subtitle} maxLength={120} onActivate={activate} onChange={(subtitle) => patchMessage((m) => ({ ...m, subtitle }))} />
          </Section>

          <Section title="Message">
            <TagField id="mk-body" label="Description" multiline rows={6} value={message.body} maxLength={2000} onActivate={activate} onChange={(body) => patchMessage((m) => ({ ...m, body }))} hint="Leave an empty line to start a new paragraph." />
          </Section>

          <Section title="Photo" toggle={{ on: message.image.enabled, set: (enabled) => patchMessage((m) => ({ ...m, image: { ...m.image, enabled } })) }}>
            {message.image.url && <img className="mk-photo" src={message.image.url} alt="" />}
            <ImageUpload label="Photo" folder="emails" value={message.image.url} onChange={(url) => patchMessage((m) => ({ ...m, image: { ...m.image, url } }))} hint="A wide photo works best. Up to 10 MB." />
            <Field label="Describe the photo" htmlFor="mk-alt" hint="Shown if images are turned off.">
              <input id="mk-alt" className="input" maxLength={120} value={message.image.alt} onChange={(event) => patchMessage((m) => ({ ...m, image: { ...m.image, alt: event.target.value } }))} placeholder="e.g. Saffron rice with lamb kebab" />
            </Field>
          </Section>

          <Section title="Code box" toggle={{ on: message.offer.enabled, set: (enabled) => patchMessage((m) => ({ ...m, offer: { ...m.offer, enabled } })) }}>
            <div className="form-grid form-grid--2">
              <TagField id="mk-offer-label" label="Label" value={message.offer.label} maxLength={40} onActivate={activate} onChange={(label) => patchMessage((m) => ({ ...m, offer: { ...m.offer, label } }))} placeholder="Your code" />
              <Field label="Code or gift" htmlFor="mk-code">
                <input id="mk-code" className="input mk-code-input" maxLength={30} value={message.offer.code} onChange={(event) => patchMessage((m) => ({ ...m, offer: { ...m.offer, code: event.target.value } }))} placeholder="KATEH15" />
              </Field>
            </div>
            <TagField id="mk-offer-note" label="Small print" value={message.offer.note} maxLength={140} onActivate={activate} onChange={(note) => patchMessage((m) => ({ ...m, offer: { ...m.offer, note } }))} placeholder="Valid this week only · show this email" />
          </Section>

          <Section title="Button" toggle={{ on: message.button.enabled, set: (enabled) => patchMessage((m) => ({ ...m, button: { ...m.button, enabled } })) }}>
            <div className="form-grid form-grid--2">
              <TagField id="mk-btn" label="Button text" value={message.button.label} maxLength={30} onActivate={activate} onChange={(label) => patchMessage((m) => ({ ...m, button: { ...m.button, label } }))} placeholder="Order now" />
              <Field label="Opens" htmlFor="mk-btn-target">
                <select id="mk-btn-target" className="select" value={message.button.target} onChange={(event) => patchMessage((m) => ({ ...m, button: { ...m.button, target: event.target.value as EmailMessage['button']['target'] } }))}>
                  <option value="menu">The menu</option>
                  <option value="reserve">Book a table</option>
                  <option value="website">The website</option>
                  <option value="custom">Another link…</option>
                </select>
              </Field>
            </div>
            {message.button.target === 'custom' && (
              <Field label="Link" htmlFor="mk-btn-url">
                <input id="mk-btn-url" className="input" type="url" inputMode="url" placeholder="https://" value={message.button.url} onChange={(event) => patchMessage((m) => ({ ...m, button: { ...m.button, url: event.target.value } }))} />
              </Field>
            )}
          </Section>

          <Section title="Closing">
            <TagField id="mk-closing" label="Sign-off" multiline rows={2} value={message.closing} maxLength={200} onActivate={activate} onChange={(closing) => patchMessage((m) => ({ ...m, closing }))} />
          </Section>

          <div className="mk-tools">
            <button type="button" className="btn btn--soft" onClick={() => setPreview(true)}>
              <Eye size={16} /> Preview
            </button>
            <button type="button" className="btn btn--ghost" disabled={testing} onClick={() => void sendTest()}>
              <Send size={16} /> {testing ? 'Sending…' : 'Send me a test'}
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setSaveName(draft.name || message.subject || MESSAGE_TYPES.find((type) => type.key === message.type)?.name || '')}>
              <Save size={16} /> Save to My messages
            </button>
          </div>

          <div className="mk-card mk-checks">
            <h4>Before you send</h4>
            <ul>
              {checks.map((check) => (
                <li key={check.text} className={check.ok ? 'is-ok' : check.warning ? 'is-warn' : 'is-bad'}>
                  {check.ok ? <Check size={15} /> : <CircleAlert size={15} />}
                  {check.text}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------- step 3 */}
      {draft.step === 3 && message && (
        <div className="mk-stack">
          <div>
            <h3 className="mk-h">Who gets it?</h3>
            <p className="muted-note">Unsubscribed and unverified customers are always skipped.</p>
          </div>
          <AudienceStep
            customers={customers}
            audience={draft.audience}
            onChange={(audience) => patch({ audience })}
            timezone={settings.timezone}
            currency={settings.currency}
            recentlyEmailed={recentlyEmailed}
            automatic={draft.delivery === 'automatic'}
          />
        </div>
      )}

      {/* ---------------------------------------------------------- step 4 */}
      {draft.step === 4 && message && (
        <div className="mk-stack">
          <h3 className="mk-h">When should it go out?</h3>
          <div className="mk-choices mk-choices--3" role="radiogroup" aria-label="When">
            {(
              [
                ['now', Send, 'Send now', 'Right away'],
                ['scheduled', CalendarClock, 'Schedule', 'Pick a date and time'],
                ['automatic', Repeat, 'Automatically', 'Every day or on set days'],
              ] as const
            ).map(([value, Icon, title, text]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={draft.delivery === value}
                disabled={Boolean(draft.id) && draft.delivery !== value && (value === 'now' || draft.delivery === 'automatic' || value === 'automatic')}
                className={`mk-choice${draft.delivery === value ? ' is-active' : ''}`}
                onClick={() => {
                  if (value === 'automatic' && draft.audience.mode === 'selected') {
                    patch({ delivery: value, audience: { ...draft.audience, mode: 'all' } })
                    toast.info('Automatic emails go to a group, so “Everyone” is selected. You can filter in step 3.')
                  } else patch({ delivery: value })
                }}
              >
                <span className="mk-choice__icon">
                  <Icon size={18} />
                </span>
                <span className="mk-choice__text">
                  <strong>{title}</strong>
                  <small>{text}</small>
                </span>
              </button>
            ))}
          </div>

          {draft.delivery === 'scheduled' && (
            <div className="mk-card mk-section__body">
              <Field label="Date and time" htmlFor="mk-when" hint="In your device's time.">
                <input id="mk-when" className="input" type="datetime-local" min={format(new Date(), "yyyy-MM-dd'T'HH:mm")} value={draft.sendAt} onChange={(event) => patch({ sendAt: event.target.value })} />
              </Field>
            </div>
          )}

          {draft.delivery === 'automatic' && (
            <div className="mk-card mk-section__body">
              <Field label="How often" htmlFor="mk-freq">
                <div className="segmented mk-freq" role="group" id="mk-freq">
                  {(
                    [
                      ['daily', 'Every day'],
                      ['weekdays', 'Some days'],
                      ['monthly', 'Monthly'],
                    ] as const
                  ).map(([value, label]) => (
                    <button key={value} type="button" className="segmented__option" aria-pressed={draft.schedule.frequency === value} onClick={() => patch({ schedule: { ...draft.schedule, frequency: value } })}>
                      {label}
                    </button>
                  ))}
                </div>
              </Field>
              {draft.schedule.frequency === 'weekdays' && (
                <div className="mk-days-picker" role="group" aria-label="Days">
                  {WEEKDAY_SHORT.map((label, day) => {
                    const on = draft.schedule.weekdays?.includes(day) ?? false
                    return (
                      <button
                        key={label}
                        type="button"
                        aria-pressed={on}
                        className={`mk-day${on ? ' is-active' : ''}`}
                        onClick={() => patch({ schedule: { ...draft.schedule, weekdays: on ? (draft.schedule.weekdays ?? []).filter((value) => value !== day) : [...(draft.schedule.weekdays ?? []), day] } })}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
              )}
              <div className="form-grid form-grid--2">
                {draft.schedule.frequency === 'monthly' && (
                  <Field label="Day of the month" htmlFor="mk-mday">
                    <select id="mk-mday" className="select" value={draft.schedule.month_day ?? 1} onChange={(event) => patch({ schedule: { ...draft.schedule, month_day: Number(event.target.value) } })}>
                      {Array.from({ length: 28 }, (_, index) => index + 1).map((day) => (
                        <option key={day} value={day}>
                          {day}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                <Field label="At" htmlFor="mk-time" hint={`Restaurant time (${settings.timezone})`}>
                  <input id="mk-time" className="input" type="time" value={draft.schedule.send_time} onChange={(event) => patch({ schedule: { ...draft.schedule, send_time: event.target.value || '10:00' } })} />
                </Field>
                <Field label="Each customer gets it" htmlFor="mk-repeat">
                  <select id="mk-repeat" className="select" value={draft.repeat} onChange={(event) => patch({ repeat: event.target.value as RepeatPolicy })}>
                    {(Object.keys(REPEAT_LABELS) as RepeatPolicy[]).map((policy) => (
                      <option key={policy} value={policy}>
                        {REPEAT_LABELS[policy]}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>
          )}

          <Field label="Name (only you see this)" htmlFor="mk-name">
            <input id="mk-name" className="input" maxLength={80} value={draft.name} placeholder={message.subject || 'e.g. Weekend offer'} onChange={(event) => patch({ name: event.target.value })} />
          </Field>

          <dl className="mk-card mk-summary">
            <div>
              <dt>Email</dt>
              <dd>{message.subject || '—'}</dd>
            </div>
            <div>
              <dt>To</dt>
              <dd>
                {describeAudience(draft.audience)} · {recipients.length} {draft.delivery === 'automatic' ? 'right now' : recipients.length === 1 ? 'customer' : 'customers'}
              </dd>
            </div>
            <div>
              <dt>When</dt>
              <dd>
                {draft.delivery === 'now'
                  ? 'Right away'
                  : draft.delivery === 'scheduled'
                    ? draft.sendAt
                      ? format(new Date(draft.sendAt), 'EEE d MMM yyyy, h:mm a')
                      : 'Pick a time'
                    : `${describeSchedule(draft.schedule)} · ${REPEAT_LABELS[draft.repeat].toLowerCase()}${firstRun ? ` · first on ${format(firstRun, 'EEE d MMM, h:mm a')}` : ''}`}
              </dd>
            </div>
            <div>
              <dt>From</dt>
              <dd>
                {marketingSettings?.sender_name || settings.restaurant_name} · info@kateh.io
              </dd>
            </div>
          </dl>
        </div>
      )}

      {/* ------------------------------------------------------- bottom bar */}
      {draft.step > 1 && (
        <div className="mk-bar">
          <button type="button" className="btn btn--ghost" onClick={() => goTo((draft.step - 1) as ComposerDraft['step'])}>
            <ArrowLeft size={17} /> Back
          </button>
          {draft.step === 2 && (
            <button type="button" className="btn btn--ghost mk-bar__preview" onClick={() => setPreview(true)}>
              <Eye size={17} /> Preview
            </button>
          )}
          {draft.step < 4 ? (
            <button type="button" className="btn btn--gold" onClick={next}>
              Continue <ArrowRight size={17} />
            </button>
          ) : (
            <button type="button" className="btn btn--gold" disabled={busy} onClick={() => void submit()}>
              {draft.delivery === 'automatic' ? <Zap size={17} /> : draft.delivery === 'scheduled' ? <CalendarClock size={17} /> : <Send size={17} />}
              {finalLabel}
            </button>
          )}
        </div>
      )}

      <PreviewSheet message={preview ? message : null} sampleName={sample} senderName={marketingSettings?.sender_name} onClose={() => setPreview(false)} />

      <ConfirmDialog
        open={confirmSend}
        title={`Send to ${recipients.length} ${recipients.length === 1 ? 'customer' : 'customers'}?`}
        confirmLabel="Send now"
        busy={busy}
        message={
          <p>
            “{message?.subject}” goes out from info@kateh.io right away. This cannot be undone.
          </p>
        }
        onCancel={() => setConfirmSend(false)}
        onConfirm={() => void sendNow()}
      />

      <Sheet
        open={saveName !== null}
        onClose={() => setSaveName(null)}
        title="Save to My messages"
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setSaveName(null)}>
              Cancel
            </button>
            <button type="button" className="btn btn--gold" onClick={() => void saveTemplate()}>
              Save
            </button>
          </>
        }
      >
        <Field label="Name" htmlFor="mk-save-name" hint="It appears in step 1 under “My messages”.">
          <input id="mk-save-name" className="input" value={saveName ?? ''} onChange={(event) => setSaveName(event.target.value)} data-autofocus />
        </Field>
      </Sheet>
    </div>
  )
}
