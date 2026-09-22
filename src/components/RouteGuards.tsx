import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { PageLoading } from './ui/primitives'

/** Customer-only routes. Guests are sent to /login and returned here afterwards. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <PageLoading />
  if (!user) return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />
  return <>{children}</>
}

/**
 * Every /admin/* route. Waits for both the session and the admin check, so a signed-in admin is never bounced
 * to the login screen while the check is still running. RLS remains the real enforcement.
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, loading, adminChecked, isAdmin, signOut } = useAuth()
  if (loading || (user && !adminChecked)) return <PageLoading />
  if (!user) return <Navigate to="/admin/login" replace />
  if (!isAdmin) {
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
  return <>{children}</>
}
