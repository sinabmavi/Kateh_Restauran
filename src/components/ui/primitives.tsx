import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Minus, Plus } from 'lucide-react'

export function Spinner({ large }: { large?: boolean }) {
  return <div className={`spinner${large ? ' spinner--lg' : ''}`} role="progressbar" aria-label="Loading" />
}

export function PageLoading() {
  return (
    <div className="page-loading">
      <Spinner large />
    </div>
  )
}

export function Skeleton({ style, className = '' }: { style?: CSSProperties; className?: string }) {
  return <div className={`skeleton ${className}`} style={style} aria-hidden />
}

interface EmptyStateProps {
  icon: ReactNode
  title: string
  text?: string
  action?: ReactNode
}

export function EmptyState({ icon, title, text, action }: EmptyStateProps) {
  return (
    <div className="empty">
      <div className="empty__icon">{icon}</div>
      <h3 className="empty__title">{title}</h3>
      {text && <p className="empty__text">{text}</p>}
      {action}
    </div>
  )
}

interface ErrorStateProps {
  message: string
  onRetry?: () => void
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="empty" role="alert">
      <h3 className="empty__title">We hit a snag</h3>
      <p className="empty__text">{message}</p>
      {onRetry && (
        <button type="button" className="btn btn--dark" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  )
}

interface QuantityStepperProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  label?: string
}

export function QuantityStepper({ value, onChange, min = 0, max = 50, label = 'quantity' }: QuantityStepperProps) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" className="stepper__btn" aria-label={`Decrease ${label}`} disabled={value <= min} onClick={() => onChange(value - 1)}>
        <Minus size={18} />
      </button>
      <span className="stepper__value" aria-live="polite">
        {value}
      </span>
      <button type="button" className="stepper__btn" aria-label={`Increase ${label}`} disabled={value >= max} onClick={() => onChange(value + 1)}>
        <Plus size={18} />
      </button>
    </div>
  )
}

interface FieldProps {
  label: string
  htmlFor: string
  hint?: string
  error?: string | null
  children: ReactNode
}

export function Field({ label, htmlFor, hint, error, children }: FieldProps) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? (
        <p className="field__error" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="field__hint">{hint}</p>
      )}
    </div>
  )
}

interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  disabled?: boolean
}

export function Switch({ checked, onChange, label, disabled }: SwitchProps) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" disabled={disabled} onClick={() => onChange(!checked)} />
  )
}

/** Fades a section in the first time it scrolls into view. */
export function Reveal({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node || typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={ref} className={`reveal${visible ? ' is-visible' : ''} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  )
}
