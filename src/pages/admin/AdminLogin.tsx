import { useEffect, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { Emblem } from '../../components/Emblem'
import { Field, PageLoading } from '../../components/ui/primitives'
import { useAuth } from '../../context/AuthContext'
import { useSettings } from '../../context/SettingsContext'
import { errorMessage } from '../../lib/errors'

export default function AdminLogin() {
  const { user, loading, adminChecked, isAdmin, signIn, signOut } = useAuth()
  const { settings } = useSettings()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    document.title = `Admin sign in · ${settings?.restaurant_name ?? ''}`
  }, [settings?.restaurant_name])

  if (loading || (user && !adminChecked)) return <PageLoading />
  if (user && isAdmin) return <Navigate to="/admin" replace />

  if (user) {
    return (
      <div className="admin-gate">
        <div className="admin-gate__card card card--pad">
          <span className="empty__icon">
            <ShieldAlert size={28} />
          </span>
          <p className="admin-gate__msg">You are signed in, but you are not authorized as an admin.</p>
          <button type="button" className="btn btn--dark" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </div>
    )
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await signIn(email, password)
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="admin-login">
      <form className="admin-login__card" onSubmit={submit}>
        <span className="admin-login__emblem">
          <Emblem size={44} />
        </span>
        <h1 className="admin-login__title">Dashboard sign in</h1>
        <p className="muted-note">{settings?.restaurant_name}</p>
        <Field label="Email" htmlFor="ad-email">
          <input id="ad-email" className="input" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </Field>
        <Field label="Password" htmlFor="ad-password">
          <input id="ad-password" className="input" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </Field>
        {error && (
          <div className="notice notice--danger" role="alert">
            {error}
          </div>
        )}
        <button type="submit" className="btn btn--gold btn--lg btn--block" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
