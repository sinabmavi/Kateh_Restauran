import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { Armchair, ArrowLeft, ArrowRight, CalendarPlus, Check, Info, Phone, TriangleAlert, Users } from 'lucide-react'
import { PayPalCheckout, FLOW_HANDLED } from '../components/PayPalCheckout'
import { ErrorState, Field, Skeleton } from '../components/ui/primitives'
import { useAuth } from '../context/AuthContext'
import { useRequiredSettings, useSettings } from '../context/SettingsContext'
import { useToast } from '../context/ToastContext'
import { useAsync } from '../hooks/useAsync'
import { useDocumentMeta } from '../hooks/useDocumentMeta'
import { createReservationCheckout } from '../lib/api'
import { fetchActiveTables, fetchBlockedDates, fetchBusySlots } from '../lib/data'
import { AppError, errorMessage, isSlotTakenError } from '../lib/errors'
import { formatMoney, isValidEmail, isValidPhone, telHref } from '../lib/format'
import { buildIcs, downloadIcs } from '../lib/ics'
import { dateKey, dayStatus, generateSlots, partySizeLimit, slotTime, sortTables, upcomingDates, type Slot } from '../lib/slots'
import type { CaptureResponse, ReservationCheckoutRequest, ReservationStatus } from '../lib/types'
import { toCents } from '../../supabase/functions/_shared/rules'

type Step = 1 | 2 | 3 | 4

interface Outcome {
  reservationId: string
  status: ReservationStatus
  paid: boolean
  needsRefund: boolean
  message?: string
  slot: Slot
  partySize: number
  name: string
  tableName: string
}

const STEP_LABELS = ['Party size', 'Table', 'Date & time', 'Your details']

export default function ReservePage() {
  const settings = useRequiredSettings()
  const { hours } = useSettings()
  const { user, profile, adminChecked } = useAuth()
  const toast = useToast()
  useDocumentMeta('Reserve a table', 'Reserve your table online. Pick your party size, date and time.')

  const [step, setStep] = useState<Step>(1)
  const [partySize, setPartySize] = useState<number | null>(null)
  const [tableId, setTableId] = useState<string | null>(null)
  const [date, setDate] = useState<Date | null>(null)
  const [slot, setSlot] = useState<Slot | null>(null)
  const [form, setForm] = useState({ name: '', email: '', phone: '', requests: '' })
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const prefilled = useRef(false)

  const reference = useAsync(async () => {
    const [tables, blocked] = await Promise.all([fetchActiveTables(), fetchBlockedDates()])
    return { tables, blocked }
  }, [])

  const dates = useMemo(() => upcomingDates(settings.timezone, 21), [settings.timezone])
  const busySlots = useAsync(() => (date ? fetchBusySlots(dateKey(date)) : Promise.resolve([])), [date ? dateKey(date) : null])

  useEffect(() => {
    if (prefilled.current || !user || !adminChecked) return
    prefilled.current = true
    const meta = user.user_metadata as { full_name?: string; phone?: string } | undefined
    setForm((current) => ({
      ...current,
      name: current.name || profile?.full_name || meta?.full_name || '',
      email: current.email || user.email || '',
      phone: current.phone || profile?.phone || meta?.phone || '',
    }))
  }, [user, profile, adminChecked])

  const tables = useMemo(() => sortTables(reference.data?.tables ?? []), [reference.data])
  const blocked = reference.data?.blocked ?? []
  const limit = partySizeLimit(settings, tables)
  const table = tables.find((entry) => entry.id === tableId) ?? null

  const slots = useMemo(() => {
    if (!date || !partySize || !table || !busySlots.data) return []
    return generateSlots({ date, partySize, settings, hours, blocked, table, busy: busySlots.data })
  }, [date, partySize, table, busySlots.data, settings, hours, blocked])
  const allBooked = slots.length > 0 && slots.every((option) => option.booked)

  const depositCents = partySize ? toCents(settings.reservation_deposit_per_guest) * partySize : 0
  const needsDeposit = depositCents > 0

  const errors = {
    name: form.name.trim().length < 2 ? 'Please enter your full name.' : undefined,
    email: isValidEmail(form.email) ? undefined : 'Please enter a valid email address.',
    phone: isValidPhone(form.phone) ? undefined : 'Please enter a phone number we can reach you on.',
  }
  const detailsValid = !errors.name && !errors.email && !errors.phone

  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value }))
  const blur = (key: string) => () => setTouched((current) => ({ ...current, [key]: true }))
  const shown = (key: keyof typeof errors) => (touched[key] ? errors[key] : undefined)

  const request = (): ReservationCheckoutRequest => ({
    kind: 'reservation',
    full_name: form.name.trim(),
    email: form.email.trim(),
    phone: form.phone.trim(),
    party_size: partySize ?? 0,
    date: date ? dateKey(date) : '',
    start_time: slot ? slotTime(slot) : '',
    special_requests: form.requests.trim(),
    table_id: tableId ?? undefined,
  })

  const finish = (partial: Pick<Outcome, 'reservationId' | 'status' | 'paid' | 'needsRefund' | 'message'>) => {
    if (!slot || !partySize) return
    setOutcome({ ...partial, slot, partySize, name: form.name.trim(), tableName: table?.table_name ?? '' })
  }

  const handleFailure = (error: unknown) => {
    if (isSlotTakenError(error)) {
      busySlots.reload()
      setSlot(null)
      setStep(3)
    }
  }

  const confirmWithoutDeposit = async () => {
    setBusy(true)
    try {
      const response = await createReservationCheckout(request())
      finish({ reservationId: response.reservationId, status: response.status, paid: false, needsRefund: false })
    } catch (error) {
      toast.error(errorMessage(error))
      handleFailure(error)
    } finally {
      setBusy(false)
    }
  }

  const createDepositOrder = async () => {
    const response = await createReservationCheckout(request())
    if (!response.requiresPayment || !response.paypalOrderId) {
      // The deposit was switched off after this page loaded; the reservation is already held.
      finish({ reservationId: response.reservationId, status: response.status, paid: false, needsRefund: false })
      throw new AppError('No payment needed', FLOW_HANDLED)
    }
    return response.paypalOrderId
  }

  const onCaptured = (result: CaptureResponse) => {
    finish({
      reservationId: result.reservationId ?? '',
      status: result.reservationStatus ?? 'confirmed',
      paid: result.captureStatus === 'completed' && !result.needsRefund,
      needsRefund: result.needsRefund,
      message: result.message,
    })
  }

  const addToCalendar = () => {
    if (!outcome) return
    downloadIcs(
      'reservation.ics',
      buildIcs({
        uid: outcome.reservationId,
        title: `Dinner at ${settings.restaurant_name}`,
        description: `Table for ${outcome.partySize}. Booked under ${outcome.name}.`,
        location: settings.restaurant_address ?? settings.restaurant_name,
        start: outcome.slot.start,
        end: outcome.slot.end,
        timezone: settings.timezone,
      }),
    )
  }

  /* ---------------------------------------------------------- outcome */

  if (outcome) {
    const { slot: booked } = outcome
    if (outcome.needsRefund) {
      return (
        <div className="container page reserve">
          <div className="result card card--pad result--warn">
            <span className="result__icon result__icon--warn">
              <TriangleAlert size={34} />
            </span>
            <h1 className="result__title">We could not keep your table</h1>
            <p className="result__text">
              {outcome.message ?? 'Your payment reached us just after the table hold expired, and someone else took the table. Your deposit will be refunded to your PayPal account.'}
            </p>
            <div className="result__actions">
              <button
                type="button"
                className="btn btn--gold"
                onClick={() => {
                  setOutcome(null)
                  setSlot(null)
                  setStep(3)
                  busySlots.reload()
                }}
              >
                Choose another time
              </button>
              {settings.restaurant_phone && (
                <a href={telHref(settings.restaurant_phone)} className="btn btn--ghost">
                  <Phone size={16} /> Call us
                </a>
              )}
            </div>
          </div>
        </div>
      )
    }

    const confirmed = outcome.status === 'confirmed'
    return (
      <div className="container page reserve">
        <div className="result card card--pad">
          <span className="result__icon">
            <Check size={36} strokeWidth={3} />
          </span>
          <h1 className="result__title">{confirmed ? 'Your table is confirmed' : 'Reservation received'}</h1>
          <p className="result__text">
            {confirmed
              ? `Thank you, ${outcome.name.split(' ')[0]}. We look forward to seeing you.`
              : `Thank you, ${outcome.name.split(' ')[0]}. Your table is held and we will confirm it shortly.`}
          </p>
          <dl className="result__summary">
            <div>
              <dt>When</dt>
              <dd>
                {format(booked.start, 'EEEE, d MMMM')} at {booked.label}
              </dd>
            </div>
            <div>
              <dt>Party</dt>
              <dd>{outcome.partySize === 1 ? '1 guest' : `${outcome.partySize} guests`}</dd>
            </div>
            {outcome.tableName && (
              <div>
                <dt>Table</dt>
                <dd>{outcome.tableName}</dd>
              </div>
            )}
            <div>
              <dt>Where</dt>
              <dd>{settings.restaurant_address ?? settings.restaurant_name}</dd>
            </div>
            {outcome.paid && (
              <div>
                <dt>Deposit</dt>
                <dd>{formatMoney(depositCents / 100, settings.currency)} paid</dd>
              </div>
            )}
          </dl>
          <div className="result__actions">
            <button type="button" className="btn btn--gold" onClick={addToCalendar}>
              <CalendarPlus size={18} /> Add to calendar (.ics)
            </button>
            {user ? (
              <Link to="/account" className="btn btn--ghost">
                View my reservations
              </Link>
            ) : (
              <Link to="/menu" className="btn btn--ghost">
                Browse the menu
              </Link>
            )}
          </div>
        </div>
      </div>
    )
  }

  /* ------------------------------------------------------------- flow */

  const unavailable = !reference.loading && !reference.error && limit.max === 0

  return (
    <div className="container page reserve">
      <header className="page__head">
        <div>
          <p className="section-head__eyebrow">Reserve your table</p>
          <h1 className="page__title">Book a table</h1>
        </div>
      </header>

      <ol className="steps" aria-label="Reservation steps">
        {STEP_LABELS.map((label, index) => {
          const number = (index + 1) as Step
          return (
            <li key={label} className={`steps__item${step === number ? ' is-active' : ''}${step > number ? ' is-done' : ''}`} aria-current={step === number ? 'step' : undefined}>
              <span className="steps__dot">{step > number ? <Check size={14} strokeWidth={3} /> : number}</span>
              <span className="steps__label">{label}</span>
            </li>
          )
        })}
      </ol>

      {reference.error ? (
        <ErrorState message={reference.error} onRetry={reference.reload} />
      ) : reference.loading ? (
        <Skeleton style={{ height: 220 }} />
      ) : unavailable ? (
        <div className="notice notice--info" role="status">
          <Info size={18} />
          <span>
            Online booking is unavailable right now.
            {settings.restaurant_phone && (
              <>
                {' '}
                Please call us on <a href={telHref(settings.restaurant_phone)}>{settings.restaurant_phone}</a>.
              </>
            )}
          </span>
        </div>
      ) : (
        <>
          {step === 1 && (
            <section className="card card--pad reserve__panel fade-up">
              <h2 className="reserve__h">
                <Users size={22} /> How many guests?
              </h2>
              <div className="party-grid" role="radiogroup" aria-label="Party size">
                {Array.from({ length: limit.max }, (_, index) => index + 1).map((size) => (
                  <button key={size} type="button" role="radio" aria-checked={partySize === size} className={`party${partySize === size ? ' is-active' : ''}`} onClick={() => {
                      setPartySize(size)
                      setSlot(null)
                      if (table && table.capacity < size) setTableId(null)
                    }}>
                    <span className="party__num">{size}</span>
                    <span className="party__label">{size === 1 ? 'guest' : 'guests'}</span>
                  </button>
                ))}
              </div>
              {limit.exceeded && (
                <p className="notice notice--info reserve__large">
                  <Phone size={18} />
                  <span>
                    For larger groups, please call us
                    {settings.restaurant_phone && (
                      <>
                        {' '}
                        on <a href={telHref(settings.restaurant_phone)}>{settings.restaurant_phone}</a>
                      </>
                    )}
                    .
                  </span>
                </p>
              )}
              <div className="reserve__nav">
                <button type="button" className="btn btn--gold btn--lg" disabled={!partySize} onClick={() => setStep(2)}>
                  Continue <ArrowRight size={18} />
                </button>
              </div>
            </section>
          )}

          {step === 2 && partySize && (
            <section className="card card--pad reserve__panel fade-up">
              <h2 className="reserve__h">
                <Armchair size={22} /> Choose your table
              </h2>
              <div className="table-grid" role="radiogroup" aria-label="Table">
                {tables.map((option) => {
                  const fits = option.capacity >= partySize
                  const selected = tableId === option.id
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      disabled={!fits}
                      className={`table-pick${selected ? ' is-active' : ''}`}
                      onClick={() => {
                        setTableId(option.id)
                        setSlot(null)
                      }}
                    >
                      <span className="table-pick__name">{option.table_name}</span>
                      <span className="table-pick__meta">
                        <Users size={14} /> Up to {option.capacity} {option.capacity === 1 ? 'guest' : 'guests'}
                      </span>
                      {option.area && <span className="table-pick__area">{option.area}</span>}
                      {!fits && <span className="table-pick__note">Too small for {partySize}</span>}
                    </button>
                  )
                })}
              </div>
              <div className="reserve__nav">
                <button type="button" className="btn btn--ghost" onClick={() => setStep(1)}>
                  <ArrowLeft size={18} /> Back
                </button>
                <button type="button" className="btn btn--gold btn--lg" disabled={!table} onClick={() => setStep(3)}>
                  Continue <ArrowRight size={18} />
                </button>
              </div>
            </section>
          )}

          {step === 3 && partySize && table && (
            <section className="card card--pad reserve__panel fade-up">
              <p className="reserve__table-note">
                <Armchair size={16} /> {table.table_name} · up to {table.capacity} guests{table.area ? ` · ${table.area}` : ''}
              </p>
              <h2 className="reserve__h">Choose a date</h2>
              <div className="date-strip hscroll" role="listbox" aria-label="Date">
                {dates.map((day) => {
                  const status = dayStatus(day, hours, blocked)
                  const selected = date ? dateKey(date) === dateKey(day) : false
                  return (
                    <button
                      key={dateKey(day)}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={`date${selected ? ' is-active' : ''}${status !== 'open' ? ' is-off' : ''}`}
                      disabled={status !== 'open'}
                      onClick={() => {
                        setDate(day)
                        setSlot(null)
                      }}
                    >
                      <span className="date__dow">{format(day, 'EEE')}</span>
                      <span className="date__day">{format(day, 'd')}</span>
                      <span className="date__mon">{status === 'open' ? format(day, 'MMM') : 'Closed'}</span>
                    </button>
                  )
                })}
              </div>

              {date && (
                <div className="reserve__slots">
                  <h2 className="reserve__h">Choose a time</h2>
                  {busySlots.error ? (
                    <ErrorState message={busySlots.error} onRetry={busySlots.reload} />
                  ) : busySlots.loading ? (
                    <div className="slot-grid" aria-hidden>
                      {Array.from({ length: 8 }, (_, index) => (
                        <Skeleton key={index} style={{ height: 46, borderRadius: 999 }} />
                      ))}
                    </div>
                  ) : slots.length === 0 ? (
                    <p className="notice notice--info">
                      <Info size={18} />
                      <span>There are no more times on {format(date, 'EEEE d MMMM')}. Please try another day.</span>
                    </p>
                  ) : (
                    <>
                      {allBooked && (
                        <p className="notice notice--info">
                          <Info size={18} />
                          <span>
                            {table.table_name} is fully booked on {format(date, 'EEEE d MMMM')}. Please choose another day or table.
                          </span>
                        </p>
                      )}
                      <div className="slot-grid" role="listbox" aria-label="Time">
                        {slots.map((option) => {
                          const selected = !option.booked && slot?.start.getTime() === option.start.getTime()
                          return (
                            <button
                              key={option.start.getTime()}
                              type="button"
                              role="option"
                              aria-selected={selected}
                              aria-disabled={option.booked}
                              disabled={option.booked}
                              title={option.booked ? 'Already booked' : undefined}
                              className={`slot${selected ? ' is-active' : ''}${option.booked ? ' is-booked' : ''}`}
                              onClick={() => setSlot(option)}
                            >
                              {option.label}
                              {option.booked && <span className="slot__tag">Booked</span>}
                            </button>
                          )
                        })}
                      </div>
                      {!allBooked && slots.some((option) => option.booked) && <p className="muted-note">Times marked “Booked” are already reserved for this table.</p>}
                    </>
                  )}
                </div>
              )}

              <div className="reserve__nav">
                <button type="button" className="btn btn--ghost" onClick={() => setStep(2)}>
                  <ArrowLeft size={18} /> Back
                </button>
                <button type="button" className="btn btn--gold btn--lg" disabled={!slot || slot.booked} onClick={() => setStep(4)}>
                  Continue <ArrowRight size={18} />
                </button>
              </div>
            </section>
          )}

          {step === 4 && partySize && table && date && slot && (
            <div className="reserve__final fade-up">
              <section className="card card--pad reserve__panel">
                <h2 className="reserve__h">Your details</h2>
                <div className="form-grid">
                  <Field label="Full name" htmlFor="rs-name" error={shown('name')}>
                    <input id="rs-name" className="input" autoComplete="name" value={form.name} onChange={set('name')} onBlur={blur('name')} aria-invalid={Boolean(shown('name'))} />
                  </Field>
                  <div className="form-grid form-grid--2">
                    <Field label="Email" htmlFor="rs-email" error={shown('email')}>
                      <input id="rs-email" className="input" type="email" autoComplete="email" value={form.email} onChange={set('email')} onBlur={blur('email')} aria-invalid={Boolean(shown('email'))} />
                    </Field>
                    <Field label="Phone" htmlFor="rs-phone" error={shown('phone')}>
                      <input id="rs-phone" className="input" type="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} onBlur={blur('phone')} aria-invalid={Boolean(shown('phone'))} />
                    </Field>
                  </div>
                  <Field label="Special requests (optional)" htmlFor="rs-requests" hint="Allergies, celebrations, high chairs…">
                    <textarea id="rs-requests" className="textarea" maxLength={400} value={form.requests} onChange={set('requests')} />
                  </Field>
                </div>
                {!user && (
                  <p className="muted-note">
                    Have an account?{' '}
                    <Link to="/login" state={{ from: '/reserve' }} className="link">
                      Sign in
                    </Link>{' '}
                    to see your reservations later.
                  </p>
                )}
              </section>

              <aside className="card card--pad reserve__summary">
                <h2 className="reserve__h">Your reservation</h2>
                <dl className="result__summary">
                  <div>
                    <dt>When</dt>
                    <dd>
                      {format(date, 'EEEE, d MMMM')} at {slot.label}
                    </dd>
                  </div>
                  <div>
                    <dt>Party</dt>
                    <dd>{partySize === 1 ? '1 guest' : `${partySize} guests`}</dd>
                  </div>
                  <div>
                    <dt>Table</dt>
                    <dd>{table.table_name}</dd>
                  </div>
                </dl>

                {needsDeposit ? (
                  <>
                    <p className="reserve__deposit">
                      {formatMoney(settings.reservation_deposit_per_guest, settings.currency)} per guest · <strong>{formatMoney(depositCents / 100, settings.currency)} total</strong>, secures your table
                    </p>
                    <p className="muted-note">Your table is held for 15 minutes once you start paying.</p>
                    <PayPalCheckout currency={settings.currency} disabled={!detailsValid} createOrder={createDepositOrder} onCaptured={onCaptured} onFailure={handleFailure} />
                    {!detailsValid && <p className="checkout__hint">Complete your details to enable payment.</p>}
                  </>
                ) : (
                  <button type="button" className="btn btn--gold btn--lg btn--block" disabled={!detailsValid || busy} onClick={() => void confirmWithoutDeposit()}>
                    {busy ? 'Confirming…' : 'Confirm reservation'}
                  </button>
                )}
                <button type="button" className="btn btn--ghost btn--block reserve__back" onClick={() => setStep(3)}>
                  <ArrowLeft size={18} /> Change date or time
                </button>
              </aside>
            </div>
          )}
        </>
      )}
    </div>
  )
}
