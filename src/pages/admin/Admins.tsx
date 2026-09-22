import { useMemo, useState, type FormEvent } from 'react'
import { Pencil, Plus, Search, ShieldCheck, UserMinus } from 'lucide-react'
import { AdminPageHead } from '../../components/admin'
import { ConfirmDialog, Sheet } from '../../components/ui/Sheet'
import { EmptyState, ErrorState, Field, Skeleton, Switch } from '../../components/ui/primitives'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { useAsync } from '../../hooks/useAsync'
import { createAdmin, listAdmins, removeAdmin, updateAdmin } from '../../lib/api'
import { errorMessage } from '../../lib/errors'
import { formatTimestamp, timeAgo } from '../../lib/format'
import type { AdminAccount, AdminRole } from '../../lib/types'

interface Draft {
  user_id?: string
  full_name: string
  email: string
  password: string
  role: AdminRole
}

const EMPTY: Draft = { full_name: '', email: '', password: '', role: 'admin' }

const ROLE_LABEL: Record<AdminRole, string> = { admin: 'Admin', super_admin: 'Super admin' }

function initials(name: string | null, email: string | null): string {
  const source = name?.trim() || email || '?'
  return source
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('')
}

export default function AdminsPage() {
  const { user } = useAuth()
  const toast = useToast()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [removing, setRemoving] = useState<AdminAccount | null>(null)
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState('')
  const [role, setRole] = useState<'' | AdminRole>('')
  const state = useAsync(listAdmins, [])

  const admins = state.data ?? []

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return admins.filter((entry) => (!role || entry.role === role) && (!needle || `${entry.full_name ?? ''} ${entry.email ?? ''}`.toLowerCase().includes(needle)))
  }, [admins, search, role])

  const open = (next: Draft) => {
    setShowPassword(false)
    setDraft(next)
  }

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!draft) return
    const isNew = !draft.user_id
    if (draft.full_name.trim().length < 2) return toast.error('Please enter the admin’s name.')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())) return toast.error('Please enter a valid email address.')
    if ((isNew || draft.password) && draft.password.length < 8) return toast.error('The password must be at least 8 characters.')

    setBusy(true)
    try {
      const input = { full_name: draft.full_name.trim(), email: draft.email.trim(), password: draft.password, role: draft.role }
      if (draft.user_id) await updateAdmin(draft.user_id, input)
      else await createAdmin(input)
      toast.success(isNew ? 'Admin added. They can sign in at /admin/login.' : 'Admin updated')
      setDraft(null)
      state.reload()
    } catch (failure) {
      toast.error(errorMessage(failure))
    } finally {
      setBusy(false)
    }
  }

  const confirmRemove = async () => {
    if (!removing) return
    setBusy(true)
    try {
      await removeAdmin(removing.user_id)
      toast.success('Admin access removed')
      setRemoving(null)
      setDraft(null)
      state.reload()
    } catch (failure) {
      toast.error(errorMessage(failure))
    } finally {
      setBusy(false)
    }
  }

  const editing = draft?.user_id ? admins.find((entry) => entry.user_id === draft.user_id) : undefined
  const editingSelf = Boolean(draft?.user_id && draft.user_id === user?.id)

  return (
    <>
      <AdminPageHead
        title="Admins"
        subtitle="People who can sign in to this dashboard. Only super admins can see this page and add, edit or remove admins."
        actions={
          <button type="button" className="btn btn--gold" onClick={() => open({ ...EMPTY })}>
            <Plus size={17} /> Add admin
          </button>
        }
      />

      <div className="toolbar">
        <label className="toolbar__search">
          <Search size={17} />
          <input type="search" className="toolbar__input" placeholder="Search admins" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search admins" />
        </label>
        <select className="select select--sm toolbar__select" value={role} onChange={(event) => setRole(event.target.value as typeof role)} aria-label="Filter by role">
          <option value="">All roles</option>
          <option value="super_admin">Super admins</option>
          <option value="admin">Admins</option>
        </select>
      </div>

      {state.error ? (
        <ErrorState message={state.error} onRetry={state.reload} />
      ) : !state.data ? (
        <Skeleton style={{ height: 300, borderRadius: 22 }} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck size={28} />}
          title={admins.length === 0 ? 'No admins yet' : 'No admins match'}
          text={admins.length === 0 ? 'Add someone and they can sign in to the dashboard straight away.' : 'Try a different search.'}
        />
      ) : (
        <div className="table-wrap card">
          <table className="dt">
            <thead>
              <tr>
                <th>Admin</th>
                <th>Role</th>
                <th>Last sign in</th>
                <th>Added</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((entry) => (
                <tr key={entry.user_id}>
                  <td data-label="Admin">
                    <span className="dish-cell">
                      <span className="dish-cell__thumb admin-initials" aria-hidden>
                        {initials(entry.full_name, entry.email)}
                      </span>
                      <span className="dt__stack">
                        <strong>
                          {entry.full_name || 'No name'}
                          {entry.user_id === user?.id && <span className="badge badge--info admin-you">You</span>}
                        </strong>
                        <small>{entry.email ?? '—'}</small>
                      </span>
                    </span>
                  </td>
                  <td data-label="Role">
                    <span className={`badge ${entry.role === 'super_admin' ? 'badge--gold' : ''}`}>{ROLE_LABEL[entry.role]}</span>
                  </td>
                  <td data-label="Last sign in">{entry.last_sign_in_at ? timeAgo(entry.last_sign_in_at) : <span className="muted-note">Never</span>}</td>
                  <td data-label="Added">{formatTimestamp(entry.created_at, 'd MMM yyyy')}</td>
                  <td data-label="">
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => open({ user_id: entry.user_id, full_name: entry.full_name ?? '', email: entry.email ?? '', password: '', role: entry.role })}
                    >
                      <Pencil size={14} /> Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Sheet
        open={Boolean(draft)}
        onClose={() => setDraft(null)}
        placement="right"
        title={draft?.user_id ? 'Edit admin' : 'Add admin'}
        footer={
          <>
            {draft?.user_id && !editingSelf && editing && (
              <button type="button" className="btn btn--danger-ghost" disabled={busy} onClick={() => setRemoving(editing)}>
                <UserMinus size={16} /> Remove
              </button>
            )}
            <button type="button" className="btn btn--ghost" onClick={() => setDraft(null)}>
              Cancel
            </button>
            <button type="submit" form="admin-form" className="btn btn--gold" disabled={busy}>
              {busy ? 'Saving…' : draft?.user_id ? 'Save changes' : 'Add admin'}
            </button>
          </>
        }
      >
        {draft && (
          <form id="admin-form" className="form-grid" onSubmit={save} autoComplete="off">
            <Field label="Full name" htmlFor="ad-name">
              <input id="ad-name" className="input" value={draft.full_name} onChange={(event) => setDraft({ ...draft, full_name: event.target.value })} data-autofocus />
            </Field>
            <Field label="Email" htmlFor="ad-email" hint="They sign in at /admin/login with this email.">
              <input id="ad-email" className="input" type="email" inputMode="email" autoComplete="off" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} />
            </Field>
            <Field label={draft.user_id ? 'New password' : 'Password'} htmlFor="ad-password" hint={draft.user_id ? 'Leave blank to keep the current password.' : 'At least 8 characters. Share it with them privately.'}>
              <input
                id="ad-password"
                className="input"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={draft.password}
                onChange={(event) => setDraft({ ...draft, password: event.target.value })}
              />
            </Field>
            <div className="switch-row">
              <div>
                <strong>Show password</strong>
              </div>
              <Switch checked={showPassword} onChange={setShowPassword} label="Show password" />
            </div>
            <Field
              label="Role"
              htmlFor="ad-role"
              hint={draft.role === 'super_admin' ? 'Full access, including adding, editing and removing admins.' : 'Full access to orders, reservations, menu and settings. Cannot manage admins.'}
            >
              <select id="ad-role" className="select" value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value as AdminRole })}>
                <option value="admin">Admin</option>
                <option value="super_admin">Super admin</option>
              </select>
            </Field>
            {editingSelf && <p className="muted-note">This is your own account. You cannot remove yourself, and the last super admin cannot be changed to a normal admin.</p>}
          </form>
        )}
      </Sheet>

      <ConfirmDialog
        open={Boolean(removing)}
        danger
        title={`Remove ${removing?.full_name || removing?.email || 'this admin'}?`}
        confirmLabel="Remove admin"
        busy={busy}
        message={<p>They will lose access to the dashboard straight away. Their login stays, but only as a normal customer account.</p>}
        onCancel={() => setRemoving(null)}
        onConfirm={() => void confirmRemove()}
      />
    </>
  )
}
