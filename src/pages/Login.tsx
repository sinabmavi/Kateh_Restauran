import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { MailCheck } from 'lucide-react'
import { Field } from '../components/ui/primitives'
import { useAuth } from '../context/AuthContext'
import { useDocumentMeta } from '../hooks/useDocumentMeta'
import { errorMessage } from '../lib/errors'
import { isValidBirthday, isValidEmail, isValidPhone } from '../lib/format'

type Tab = 'signin' | 'signup'

export default function LoginPage() {
  const { user, loading, signIn, signUp } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/account'
  const [tab, setTab] = useState<Tab>('signin')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmEmail, setConfirmEmail] = useState<string | null>(null)
  const [form, setForm] = useState({ fullName: '', phone: '', birthday: '', email: '', password: '' })
  useDocumentMeta('Sign in')

  useEffect(() => setError(null), [tab])

  if (!loading && user) return <Navigate to={from} replace />

  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value }))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)

    if (!isValidEmail(form.email)) return setError('Please enter a valid email address.')
    if (form.password.length < 6) return setError('Your password needs at least 6 characters.')
    if (tab === 'signup') {
      if (form.fullName.trim().length < 2) return setError('Please enter your full name.')
      if (!isValidPhone(form.phone)) return setError('Please enter a phone number we can reach you on.')
      if (!isValidBirthday(form.birthday)) return setError('Please enter your date of birth.')
    }

    setBusy(true)
    try {
      if (tab === 'signin') {
        await signIn(form.email, form.password)
        navigate(from, { replace: true })
      } else {
        const { needsConfirmation } = await signUp(form)
        if (needsConfirmation) setConfirmEmail(form.email.trim())
        else navigate(from, { replace: true })
      }
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setBusy(false)
    }
  }

  if (confirmEmail) {
    return (
      <div className="container auth">
        <div className="auth__card card card--pad auth__confirm">
          <span className="empty__icon">
            <MailCheck size={28} />
          </span>
          <h1 className="auth__title">Check your inbox</h1>
          <p className="muted-note">
            We sent a confirmation link to <strong>{confirmEmail}</strong>. Open it to activate your account, then come back and sign in.
          </p>
          <button
            type="button"
            className="btn btn--dark"
            onClick={() => {
              setConfirmEmail(null)
              setTab('signin')
            }}
          >
            Back to sign in
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="container auth">
      <div className="auth__card card card--pad">
        <h1 className="auth__title">{tab === 'signin' ? 'Welcome back' : 'Create your account'}</h1>
        <p className="muted-note">{tab === 'signin' ? 'Sign in to check out and track your orders.' : 'Save your details for faster checkout and live order tracking.'}</p>

        <div className="segmented auth__tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'signin'} className="segmented__option" aria-pressed={tab === 'signin'} onClick={() => setTab('signin')}>
            Sign in
          </button>
          <button type="button" role="tab" aria-selected={tab === 'signup'} className="segmented__option" aria-pressed={tab === 'signup'} onClick={() => setTab('signup')}>
            Create account
          </button>
        </div>

        <form className="form-grid" onSubmit={submit} noValidate>
          {tab === 'signup' && (
            <>
              <Field label="Full name" htmlFor="auth-name">
                <input id="auth-name" className="input" autoComplete="name" value={form.fullName} onChange={set('fullName')} required />
              </Field>
              <Field label="Phone" htmlFor="auth-phone">
                <input id="auth-phone" className="input" type="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} required />
              </Field>
              <Field label="Date of birth" htmlFor="auth-birthday" hint="So we can send you a birthday treat.">
                <input
                  id="auth-birthday"
                  className="input"
                  type="date"
                  autoComplete="bday"
                  min="1900-01-01"
                  max={new Date().toISOString().slice(0, 10)}
                  value={form.birthday}
                  onChange={set('birthday')}
                  required
                />
              </Field>
            </>
          )}
          <Field label="Email" htmlFor="auth-email">
            <input id="auth-email" className="input" type="email" autoComplete="email" value={form.email} onChange={set('email')} required />
          </Field>
          <Field label="Password" htmlFor="auth-password" hint={tab === 'signup' ? 'At least 6 characters.' : undefined}>
            <input
              id="auth-password"
              className="input"
              type="password"
              autoComplete={tab === 'signin' ? 'current-password' : 'new-password'}
              value={form.password}
              onChange={set('password')}
              required
            />
          </Field>

          {error && (
            <div className="notice notice--danger" role="alert">
              {error}
            </div>
          )}

          <button type="submit" className="btn btn--gold btn--lg btn--block" disabled={busy}>
            {busy ? 'Please wait…' : tab === 'signin' ? 'Sign in' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  )
}
