import { useMemo, useState } from 'react'
import { Filter, Search, UserCheck, Users } from 'lucide-react'
import { Field, Switch } from '../../../../components/ui/primitives'
import { customerInitials, type ClubCustomer } from '../../../../lib/club'
import type { Audience } from '../../../../lib/marketing'
import { exclusionReason, isReachable, resolveAudience, targetedCustomers, type AudienceFilters } from '../../../../../supabase/functions/_shared/marketing.ts'

interface AudienceStepProps {
  customers: ClubCustomer[]
  audience: Audience
  onChange: (audience: Audience) => void
  timezone: string
  currency: string
  recentlyEmailed: Set<string>
  /** Automatic emails re-check the audience every run, so hand-picked lists are not offered. */
  automatic: boolean
}

const MODES = [
  { mode: 'all' as const, icon: Users, title: 'Everyone', text: 'All subscribed customers' },
  { mode: 'selected' as const, icon: UserCheck, title: 'Pick customers', text: 'Choose people one by one' },
  { mode: 'filtered' as const, icon: Filter, title: 'Filter customers', text: 'By visits, orders, birthday…' },
]

export function AudienceStep({ customers, audience, onChange, timezone, currency, recentlyEmailed, automatic }: AudienceStepProps) {
  const [search, setSearch] = useState('')
  const filters = audience.filters ?? {}
  const setFilters = (patch: Partial<AudienceFilters>) => onChange({ ...audience, filters: { ...filters, ...patch } })

  const recipients = useMemo(() => resolveAudience(customers, audience, timezone, recentlyEmailed), [customers, audience, timezone, recentlyEmailed])
  const targeted = useMemo(() => targetedCustomers(customers, audience, timezone), [customers, audience, timezone])
  const excluded = useMemo(() => {
    const reasons = new Map<string, number>()
    for (const customer of targeted) {
      const reason = exclusionReason(customer) ?? (audience.skipRecentDays && recentlyEmailed.has(customer.user_id) ? `Emailed in the last ${audience.skipRecentDays} days` : null)
      if (reason) reasons.set(reason, (reasons.get(reason) ?? 0) + 1)
    }
    return [...reasons.entries()]
  }, [targeted, audience.skipRecentDays, recentlyEmailed])

  const selected = new Set(audience.user_ids ?? [])
  const listed = customers.filter((customer) => {
    const needle = search.trim().toLowerCase()
    return !needle || `${customer.full_name ?? ''} ${customer.email ?? ''} ${customer.phone ?? ''}`.toLowerCase().includes(needle)
  })
  const listedReachable = listed.filter(isReachable)
  const allListed = listedReachable.length > 0 && listedReachable.every((customer) => selected.has(customer.user_id))

  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange({ ...audience, user_ids: [...next] })
  }

  const toggleAll = () => {
    const next = new Set(selected)
    listedReachable.forEach((customer) => (allListed ? next.delete(customer.user_id) : next.add(customer.user_id)))
    onChange({ ...audience, user_ids: [...next] })
  }

  const number = (value: string, fallback: number) => Math.max(1, Math.round(Number(value) || fallback))

  return (
    <div className="mk-stack">
      <div className="mk-choices" role="radiogroup" aria-label="Who gets it">
        {MODES.filter((entry) => !(automatic && entry.mode === 'selected')).map(({ mode, icon: Icon, title, text }) => (
          <button key={mode} type="button" role="radio" aria-checked={audience.mode === mode} className={`mk-choice${audience.mode === mode ? ' is-active' : ''}`} onClick={() => onChange({ ...audience, mode })}>
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

      {audience.mode === 'selected' && (
        <div className="mk-card mk-pick">
          <div className="mk-pick__bar">
            <label className="toolbar__search">
              <Search size={16} />
              <input type="search" className="toolbar__input" placeholder="Search name, email or phone" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search customers" />
            </label>
            <button type="button" className="btn btn--ghost btn--sm" disabled={listedReachable.length === 0} onClick={toggleAll}>
              {allListed ? 'Clear' : `Select all (${listedReachable.length})`}
            </button>
          </div>
          <ul className="mk-pick__list">
            {listed.map((customer) => {
              const reason = exclusionReason(customer)
              return (
                <li key={customer.user_id}>
                  <label className={`mk-person${reason ? ' is-off' : ''}`}>
                    <input type="checkbox" className="club-check" disabled={Boolean(reason)} checked={selected.has(customer.user_id)} onChange={() => toggle(customer.user_id)} />
                    <span className="club-avatar club-avatar--sm">{customerInitials(customer)}</span>
                    <span className="mk-person__who">
                      <strong>{customer.full_name || 'No name'}</strong>
                      <small>{customer.email}</small>
                    </span>
                    {reason && <span className="badge">{reason}</span>}
                  </label>
                </li>
              )
            })}
            {listed.length === 0 && <li className="muted-note mk-pick__empty">No customers match.</li>}
          </ul>
        </div>
      )}

      {audience.mode === 'filtered' && (
        <div className="mk-card mk-filters">
          <Field label="Joined" htmlFor="mk-joined">
            <select
              id="mk-joined"
              className="select"
              value={filters.joinedWithinDays ? String(filters.joinedWithinDays) : ''}
              onChange={(event) => setFilters({ joinedWithinDays: event.target.value ? Number(event.target.value) : null })}
            >
              <option value="">Any time</option>
              <option value="1">In the last day</option>
              <option value="7">In the last 7 days</option>
              <option value="30">In the last 30 days</option>
              <option value="90">In the last 90 days</option>
              <option value="365">In the last year</option>
            </select>
          </Field>

          <Field label="Last order or visit" htmlFor="mk-visit">
            <div className="mk-inline">
              <select
                id="mk-visit"
                className="select"
                value={filters.lastVisit?.op ?? ''}
                onChange={(event) => setFilters({ lastVisit: event.target.value ? { op: event.target.value as 'within' | 'over', days: filters.lastVisit?.days ?? 30 } : null })}
              >
                <option value="">Any</option>
                <option value="within">Within the last…</option>
                <option value="over">More than … ago</option>
              </select>
              {filters.lastVisit && (
                <label className="mk-days">
                  <input type="number" className="input" min={1} max={730} value={filters.lastVisit.days} onChange={(event) => setFilters({ lastVisit: { ...filters.lastVisit!, days: number(event.target.value, 30) } })} />
                  days
                </label>
              )}
            </div>
          </Field>

          <Field label="Orders" htmlFor="mk-orders">
            <div className="mk-inline">
              <select
                id="mk-orders"
                className="select"
                value={filters.orders?.op ?? ''}
                onChange={(event) => setFilters({ orders: event.target.value ? { op: event.target.value as 'none' | 'at_least', count: filters.orders?.count ?? 3 } : null })}
              >
                <option value="">Any</option>
                <option value="none">Never ordered</option>
                <option value="at_least">At least…</option>
              </select>
              {filters.orders?.op === 'at_least' && (
                <label className="mk-days">
                  <input type="number" className="input" min={1} max={999} value={filters.orders.count} onChange={(event) => setFilters({ orders: { op: 'at_least', count: number(event.target.value, 3) } })} />
                  orders
                </label>
              )}
            </div>
          </Field>

          <Field label={`Spent at least (${currency})`} htmlFor="mk-spent" hint="Leave empty for any amount.">
            <input id="mk-spent" className="input" type="number" min={0} step="1" inputMode="decimal" value={filters.minSpent ?? ''} onChange={(event) => setFilters({ minSpent: event.target.value ? Math.max(0, Number(event.target.value)) : null })} />
          </Field>

          <Field label="Birthday" htmlFor="mk-bday">
            <div className="mk-inline">
              <select
                id="mk-bday"
                className="select"
                value={filters.birthday?.when ?? ''}
                onChange={(event) => setFilters({ birthday: event.target.value ? { when: event.target.value as NonNullable<AudienceFilters['birthday']>['when'], days: filters.birthday?.days ?? 3 } : null })}
              >
                <option value="">Any</option>
                <option value="today">Today</option>
                <option value="in_days">In … days</option>
                <option value="next_7_days">In the next 7 days</option>
                <option value="this_month">This month</option>
              </select>
              {filters.birthday?.when === 'in_days' && (
                <label className="mk-days">
                  <input type="number" className="input" min={1} max={60} value={filters.birthday.days ?? 3} onChange={(event) => setFilters({ birthday: { when: 'in_days', days: number(event.target.value, 3) } })} />
                  days
                </label>
              )}
            </div>
          </Field>
        </div>
      )}

      <div className="switch-row switch-row--boxed">
        <div>
          <strong>Don’t email people too often</strong>
          <p className="muted-note">
            Skip customers who got a marketing email in the last{' '}
            {audience.skipRecentDays ? (
              <input
                type="number"
                className="input mk-tiny"
                min={1}
                max={90}
                value={audience.skipRecentDays}
                onChange={(event) => onChange({ ...audience, skipRecentDays: number(event.target.value, 7) })}
                aria-label="Days"
              />
            ) : (
              '7'
            )}{' '}
            days.
          </p>
        </div>
        <Switch checked={Boolean(audience.skipRecentDays)} onChange={(on) => onChange({ ...audience, skipRecentDays: on ? 7 : null })} label="Skip recently emailed customers" />
      </div>

      <div className={`mk-count${recipients.length === 0 && !automatic ? ' is-empty' : ''}`} role="status">
        <strong>{recipients.length}</strong>
        <span>
          {automatic ? (recipients.length === 1 ? 'customer matches right now' : 'customers match right now') : recipients.length === 1 ? 'customer will receive this email' : 'customers will receive this email'}
          {recipients.length > 0 && (
            <small>
              {recipients
                .slice(0, 3)
                .map((customer) => customer.full_name || customer.email)
                .join(', ')}
              {recipients.length > 3 ? ` and ${recipients.length - 3} more` : ''}
            </small>
          )}
          {automatic && <small>The list is checked again every time it runs.</small>}
        </span>
      </div>

      {excluded.length > 0 && (
        <ul className="mk-excluded">
          {excluded.map(([reason, count]) => (
            <li key={reason}>
              {count} skipped · {reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
