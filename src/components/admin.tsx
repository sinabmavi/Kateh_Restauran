import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

interface AdminPageHeadProps {
  title: string
  subtitle?: string
  actions?: ReactNode
}

export function AdminPageHead({ title, subtitle, actions }: AdminPageHeadProps) {
  return (
    <div className="apage-head">
      <div>
        <h2 className="apage-head__title">{title}</h2>
        {subtitle && <p className="apage-head__sub">{subtitle}</p>}
      </div>
      {actions && <div className="apage-head__actions">{actions}</div>}
    </div>
  )
}

interface MetricCardProps {
  label: string
  value: ReactNode
  icon: ReactNode
  hint?: string
  tone?: 'default' | 'gold' | 'ok' | 'danger'
  to?: string
}

export function MetricCard({ label, value, icon, hint, tone = 'default', to }: MetricCardProps) {
  const body = (
    <>
      <span className={`metric__icon metric__icon--${tone}`}>{icon}</span>
      <span className="metric__value">{value}</span>
      <span className="metric__label">{label}</span>
      {hint && <span className="metric__hint">{hint}</span>}
    </>
  )
  return to ? (
    <Link to={to} className="metric card">
      {body}
    </Link>
  ) : (
    <div className="metric card">{body}</div>
  )
}

export function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel card">
      <header className="panel__head">
        <h3 className="panel__title">{title}</h3>
        {action}
      </header>
      {children}
    </section>
  )
}
