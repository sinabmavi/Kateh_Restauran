import { useEffect, useState } from 'react'
import { differenceInMinutes, parseISO } from 'date-fns'
import { TriangleAlert } from 'lucide-react'
import { Field } from '../../components/ui/primitives'
import { Sheet } from '../../components/ui/Sheet'
import type { Order } from '../../lib/types'

const QUICK_MINUTES = [15, 20, 30, 45, 60]
const DECLINE_REASONS = ['The kitchen is too busy right now', 'An item is sold out', 'We are outside your delivery area', 'We are closing shortly']

interface PrepSheetProps {
  order: Order | null
  mode: 'accept' | 'adjust'
  defaultMinutes: number
  busy: boolean
  onClose: () => void
  onConfirm: (minutes: number, note: string) => void
}

/** Accept an order (choose the preparation time) or change the remaining time on one already accepted. */
export function PrepTimeSheet({ order, mode, defaultMinutes, busy, onClose, onConfirm }: PrepSheetProps) {
  const [minutes, setMinutes] = useState(defaultMinutes)
  const [note, setNote] = useState('')

  useEffect(() => {
    if (!order) return
    if (mode === 'adjust' && order.estimated_ready_at) {
      setMinutes(Math.max(5, differenceInMinutes(parseISO(order.estimated_ready_at), new Date(), { roundingMethod: 'ceil' })))
    } else {
      setMinutes(defaultMinutes)
    }
    setNote('')
  }, [order, mode, defaultMinutes])

  if (!order) return null
  const valid = Number.isFinite(minutes) && minutes >= 1 && minutes <= 300

  return (
    <Sheet
      open
      onClose={onClose}
      title={mode === 'accept' ? `Accept order #${order.order_number}` : 'Adjust preparation time'}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn--gold" disabled={!valid || busy} onClick={() => onConfirm(minutes, note)}>
            {busy ? 'Saving…' : mode === 'accept' ? `Accept · ready in ${minutes} min` : `Set to ${minutes} min`}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <p className="muted-note">
          {mode === 'accept'
            ? 'How long until this order is ready? The customer sees a live countdown.'
            : 'Minutes from now until the order is ready. The customer’s countdown updates instantly.'}
        </p>
        <div className="quick-chips" role="group" aria-label="Preparation time">
          {QUICK_MINUTES.map((value) => (
            <button key={value} type="button" className="chip" aria-pressed={minutes === value} onClick={() => setMinutes(value)}>
              {value} min
            </button>
          ))}
        </div>
        <Field label="Or enter minutes" htmlFor="prep-minutes">
          <input id="prep-minutes" className="input" type="number" inputMode="numeric" min={1} max={300} value={Number.isFinite(minutes) ? minutes : ''} onChange={(event) => setMinutes(Number(event.target.value))} />
        </Field>
        {mode === 'accept' && (
          <Field label="Note for the customer (optional)" htmlFor="prep-note">
            <textarea id="prep-note" className="textarea" maxLength={200} value={note} onChange={(event) => setNote(event.target.value)} placeholder="e.g. We are a little busy tonight" />
          </Field>
        )}
      </div>
    </Sheet>
  )
}

interface DeclineSheetProps {
  order: Order | null
  busy: boolean
  onClose: () => void
  onConfirm: (reason: string) => void
}

export function DeclineSheet({ order, busy, onClose, onConfirm }: DeclineSheetProps) {
  const [reason, setReason] = useState('')

  useEffect(() => setReason(''), [order?.id])

  if (!order) return null
  const valid = reason.trim().length >= 3

  return (
    <Sheet
      open
      onClose={onClose}
      title={`Decline order #${order.order_number}`}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={busy}>
            Keep order
          </button>
          <button type="button" className="btn btn--danger" disabled={!valid || busy} onClick={() => onConfirm(reason.trim())}>
            {busy ? 'Declining…' : 'Decline order'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        {order.payment_status === 'paid' && (
          <div className="notice notice--danger" role="alert">
            <TriangleAlert size={18} />
            <span>
              This order is <strong>already paid</strong>. Declining does not refund it automatically. Please issue the refund from your PayPal dashboard.
            </span>
          </div>
        )}
        <p className="muted-note">The customer sees this reason on their tracking page.</p>
        <div className="quick-chips">
          {DECLINE_REASONS.map((value) => (
            <button key={value} type="button" className="chip" aria-pressed={reason === value} onClick={() => setReason(value)}>
              {value}
            </button>
          ))}
        </div>
        <Field label="Reason" htmlFor="decline-reason">
          <textarea id="decline-reason" className="textarea" maxLength={200} value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
      </div>
    </Sheet>
  )
}
