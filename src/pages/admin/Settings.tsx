import { useEffect, useState, type ReactNode } from 'react'
import { AdminPageHead } from '../../components/admin'
import { Field, Switch } from '../../components/ui/primitives'
import { useRequiredSettings, useSettings } from '../../context/SettingsContext'
import { useToast } from '../../context/ToastContext'
import { errorMessage, unwrap } from '../../lib/errors'
import { formatMoney } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import type { RestaurantSettings } from '../../lib/types'
import BannerSettings from './BannerSettings'

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'NZD', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'ILS', 'SGD', 'HKD', 'MXN', 'BRL']

interface Draft {
  restaurant_name: string
  restaurant_email: string
  restaurant_phone: string
  restaurant_address: string
  timezone: string
  currency: string
  slot_interval_minutes: string
  booking_notice_hours: string
  default_reservation_duration_minutes: string
  max_party_size: string
  reservation_deposit_per_guest: string
  ordering_enabled: boolean
  delivery_enabled: boolean
  pickup_enabled: boolean
  delivery_postcodes: string
  delivery_area_note: string
  min_order_amount: string
  default_prep_minutes: string
}

function toDraft(settings: RestaurantSettings): Draft {
  return {
    restaurant_name: settings.restaurant_name,
    restaurant_email: settings.restaurant_email ?? '',
    restaurant_phone: settings.restaurant_phone ?? '',
    restaurant_address: settings.restaurant_address ?? '',
    timezone: settings.timezone,
    currency: settings.currency,
    slot_interval_minutes: String(settings.slot_interval_minutes),
    booking_notice_hours: String(settings.booking_notice_hours),
    default_reservation_duration_minutes: String(settings.default_reservation_duration_minutes),
    max_party_size: String(settings.max_party_size),
    reservation_deposit_per_guest: String(settings.reservation_deposit_per_guest),
    ordering_enabled: settings.ordering_enabled,
    delivery_enabled: settings.delivery_enabled,
    pickup_enabled: settings.pickup_enabled,
    delivery_postcodes: settings.delivery_postcodes ?? '',
    delivery_area_note: settings.delivery_area_note ?? '',
    min_order_amount: String(settings.min_order_amount),
    default_prep_minutes: String(settings.default_prep_minutes),
  }
}

function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value })
    return true
  } catch {
    return false
  }
}

function Group({ title, text, children }: { title: string; text: string; children: ReactNode }) {
  return (
    <section className="card card--pad settings-group">
      <header>
        <h3 className="panel__title">{title}</h3>
        <p className="muted-note">{text}</p>
      </header>
      <div className="form-grid form-grid--2">{children}</div>
    </section>
  )
}

function Toggle({ label, text, checked, onChange }: { label: string; text: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="switch-row switch-row--boxed">
      <div>
        <strong>{label}</strong>
        <p className="muted-note">{text}</p>
      </div>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  )
}

export default function SettingsPage() {
  const current = useRequiredSettings()
  const { reload } = useSettings()
  const toast = useToast()
  const [draft, setDraft] = useState<Draft>(() => toDraft(current))
  const [busy, setBusy] = useState(false)
  const timezones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []

  useEffect(() => setDraft(toDraft(current)), [current])

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((state) => ({ ...state, [key]: value }))
  const text = (key: keyof Draft) => (event: { target: { value: string } }) => set(key, event.target.value as never)

  const save = async () => {
    const int = (value: string) => Number(value)
    const checks: Array<[boolean, string]> = [
      [draft.restaurant_name.trim().length > 0, 'The restaurant needs a name.'],
      [isValidTimezone(draft.timezone), 'That timezone is not recognised. Use a name like Europe/London or America/New_York.'],
      [Number.isInteger(int(draft.slot_interval_minutes)) && int(draft.slot_interval_minutes) >= 5, 'Slot interval must be a whole number of at least 5 minutes.'],
      [Number.isFinite(int(draft.booking_notice_hours)) && int(draft.booking_notice_hours) >= 0, 'Booking notice must be 0 hours or more.'],
      [Number.isInteger(int(draft.default_reservation_duration_minutes)) && int(draft.default_reservation_duration_minutes) >= 15, 'Reservation duration must be at least 15 minutes.'],
      [Number.isInteger(int(draft.max_party_size)) && int(draft.max_party_size) >= 1, 'Maximum party size must be at least 1.'],
      [Number.isFinite(int(draft.reservation_deposit_per_guest)) && int(draft.reservation_deposit_per_guest) >= 0, 'The deposit must be 0 or more.'],
      [Number.isFinite(int(draft.min_order_amount)) && int(draft.min_order_amount) >= 0, 'The minimum order must be 0 or more.'],
      [Number.isInteger(int(draft.default_prep_minutes)) && int(draft.default_prep_minutes) >= 1, 'Default preparation time must be at least 1 minute.'],
    ]
    const failed = checks.find(([ok]) => !ok)
    if (failed) return toast.error(failed[1])

    setBusy(true)
    try {
      unwrap(
        await supabase
          .from('restaurant_settings')
          .update({
            restaurant_name: draft.restaurant_name.trim(),
            restaurant_email: draft.restaurant_email.trim() || null,
            restaurant_phone: draft.restaurant_phone.trim() || null,
            restaurant_address: draft.restaurant_address.trim() || null,
            timezone: draft.timezone.trim(),
            currency: draft.currency,
            slot_interval_minutes: int(draft.slot_interval_minutes),
            booking_notice_hours: int(draft.booking_notice_hours),
            default_reservation_duration_minutes: int(draft.default_reservation_duration_minutes),
            max_party_size: int(draft.max_party_size),
            reservation_deposit_per_guest: int(draft.reservation_deposit_per_guest),
            ordering_enabled: draft.ordering_enabled,
            delivery_enabled: draft.delivery_enabled,
            pickup_enabled: draft.pickup_enabled,
            delivery_postcodes: draft.delivery_postcodes.trim() || null,
            delivery_area_note: draft.delivery_area_note.trim() || null,
            min_order_amount: int(draft.min_order_amount),
            default_prep_minutes: int(draft.default_prep_minutes),
          })
          .eq('id', current.id),
      )
      await reload()
      toast.success('Settings saved')
    } catch (failure) {
      toast.error(errorMessage(failure))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <AdminPageHead
        title="Restaurant Settings"
        subtitle="Changes appear on the public site straight away."
        actions={
          <button type="button" className="btn btn--gold" disabled={busy} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save settings'}
          </button>
        }
      />

      <div className="settings">
        <Group title="Restaurant" text="Shown across the site, in receipts and to search engines.">
          <Field label="Restaurant name" htmlFor="st-name">
            <input id="st-name" className="input" value={draft.restaurant_name} onChange={text('restaurant_name')} />
          </Field>
          <Field label="Email" htmlFor="st-email">
            <input id="st-email" className="input" type="email" value={draft.restaurant_email} onChange={text('restaurant_email')} />
          </Field>
          <Field label="Phone" htmlFor="st-phone">
            <input id="st-phone" className="input" type="tel" value={draft.restaurant_phone} onChange={text('restaurant_phone')} />
          </Field>
          <Field label="Address" htmlFor="st-address">
            <input id="st-address" className="input" value={draft.restaurant_address} onChange={text('restaurant_address')} />
          </Field>
          <Field label="Timezone" htmlFor="st-tz" hint="Used to work out “today” and booking notice for the restaurant, not the visitor.">
            <input id="st-tz" className="input" list="timezones" value={draft.timezone} onChange={text('timezone')} />
            <datalist id="timezones">
              {timezones.map((zone) => (
                <option key={zone} value={zone} />
              ))}
            </datalist>
          </Field>
          <Field label="Currency" htmlFor="st-currency" hint="Used for all prices and PayPal payments.">
            <select id="st-currency" className="select" value={draft.currency} onChange={text('currency')}>
              {[...new Set([draft.currency, ...CURRENCIES])].map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </Field>
        </Group>

        <Group title="Reservations" text="How guests can book a table.">
          <Field label="Time slot interval (minutes)" htmlFor="st-interval">
            <input id="st-interval" className="input" type="number" min={5} step={5} inputMode="numeric" value={draft.slot_interval_minutes} onChange={text('slot_interval_minutes')} />
          </Field>
          <Field label="Booking notice (hours)" htmlFor="st-notice" hint="How far ahead guests must book.">
            <input id="st-notice" className="input" type="number" min={0} step={1} inputMode="numeric" value={draft.booking_notice_hours} onChange={text('booking_notice_hours')} />
          </Field>
          <Field label="Reservation length (minutes)" htmlFor="st-duration">
            <input id="st-duration" className="input" type="number" min={15} step={15} inputMode="numeric" value={draft.default_reservation_duration_minutes} onChange={text('default_reservation_duration_minutes')} />
          </Field>
          <Field label="Maximum party size" htmlFor="st-party" hint="Guests never see more than your biggest active table seats.">
            <input id="st-party" className="input" type="number" min={1} step={1} inputMode="numeric" value={draft.max_party_size} onChange={text('max_party_size')} />
          </Field>
          <Field label={`Deposit per guest (${draft.currency})`} htmlFor="st-deposit" hint="0 means no deposit and no payment is asked for.">
            <input id="st-deposit" className="input" type="number" min={0} step="0.01" inputMode="decimal" value={draft.reservation_deposit_per_guest} onChange={text('reservation_deposit_per_guest')} />
          </Field>
        </Group>

        <Group title="Ordering and delivery" text="Turn ordering off when the kitchen is overloaded.">
          <Toggle label="Online ordering" text="Off pauses every new order, delivery and pickup." checked={draft.ordering_enabled} onChange={(value) => set('ordering_enabled', value)} />
          <Toggle label="Delivery" text="Offer delivery at checkout." checked={draft.delivery_enabled} onChange={(value) => set('delivery_enabled', value)} />
          <Toggle label="Pickup" text="Offer pickup at checkout." checked={draft.pickup_enabled} onChange={(value) => set('pickup_enabled', value)} />
          <Field label="Delivery fee" htmlFor="st-fee" hint="Automatic calculation is coming soon.">
            <input id="st-fee" className="input" readOnly value={current.delivery_fee > 0 ? formatMoney(current.delivery_fee, current.currency) : 'Free. Automatic calculation coming soon'} />
          </Field>
          <Field label="Delivery postcodes" htmlFor="st-postcodes" hint="Comma-separated postcodes or prefixes, for example: 10001, 10002 or SW1A, SE1. A guest’s postcode is accepted if it starts with an entry. Leave blank to deliver anywhere.">
            <textarea id="st-postcodes" className="textarea" value={draft.delivery_postcodes} onChange={text('delivery_postcodes')} />
          </Field>
          <Field label="Delivery area note" htmlFor="st-note" hint="Shown to guests at checkout and on the home page.">
            <textarea id="st-note" className="textarea" value={draft.delivery_area_note} onChange={text('delivery_area_note')} />
          </Field>
          <Field label={`Minimum order (${draft.currency})`} htmlFor="st-min">
            <input id="st-min" className="input" type="number" min={0} step="0.01" inputMode="decimal" value={draft.min_order_amount} onChange={text('min_order_amount')} />
          </Field>
          <Field label="Default preparation time (minutes)" htmlFor="st-prep" hint="Pre-selected when you accept an order.">
            <input id="st-prep" className="input" type="number" min={1} step={1} inputMode="numeric" value={draft.default_prep_minutes} onChange={text('default_prep_minutes')} />
          </Field>
        </Group>
      </div>

      <div className="settings__save">
        <button type="button" className="btn btn--gold btn--lg" disabled={busy} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save settings'}
        </button>
      </div>

      <BannerSettings />
    </>
  )
}
