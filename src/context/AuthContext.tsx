import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { AppError, unwrap } from '../lib/errors'
import type { Profile } from '../lib/types'

interface SignUpDetails {
  fullName: string
  phone: string
  email: string
  password: string
  /** `yyyy-MM-dd` */
  birthday: string
}

interface AuthState {
  session: Session | null
  user: User | null
  profile: Profile | null
  /** True until the stored session has been read. */
  loading: boolean
  isAdmin: boolean
  /** Super admins can also add, edit and remove other admins. */
  isSuperAdmin: boolean
  /** False while the admin check for the current user is still running. Never redirect before this is true. */
  adminChecked: boolean
  signIn: (email: string, password: string) => Promise<void>
  /** Returns `needsConfirmation: true` when the project requires the guest to confirm their email first. */
  signUp: (details: SignUpDetails) => Promise<{ needsConfirmation: boolean }>
  signOut: () => Promise<void>
  saveProfile: (patch: Partial<Omit<Profile, 'id' | 'created_at' | 'updated_at'>>) => Promise<Profile>
}

const AuthContext = createContext<AuthState | null>(null)

async function loadProfile(user: User): Promise<Profile> {
  const existing = unwrap<Profile | null>(await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle())
  if (existing) return existing
  // Accounts created before the signup trigger existed (e.g. the admin) have no profile row yet.
  const meta = user.user_metadata as { full_name?: string; phone?: string } | undefined
  return unwrap<Profile>(
    await supabase
      .from('profiles')
      .upsert({ id: user.id, full_name: meta?.full_name ?? null, phone: meta?.phone ?? null })
      .select()
      .single(),
  )
}

async function checkAdmin(user: User): Promise<{ isAdmin: boolean; isSuperAdmin: boolean }> {
  // `*` rather than named columns so this keeps working before the `role` column exists.
  const row = await supabase.from('admin_users').select('*').eq('user_id', user.id).maybeSingle()
  if (!row.error) return { isAdmin: Boolean(row.data), isSuperAdmin: (row.data as { role?: string } | null)?.role === 'super_admin' }
  const fallback = await supabase.rpc('is_admin')
  return { isAdmin: fallback.error ? false : Boolean(fallback.data), isSuperAdmin: false }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [adminChecked, setAdminChecked] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => data.subscription.unsubscribe()
  }, [])

  const user = session?.user ?? null
  const userId = user?.id ?? null

  useEffect(() => {
    if (loading) return
    if (!user) {
      setProfile(null)
      setIsAdmin(false)
      setIsSuperAdmin(false)
      setAdminChecked(true)
      return
    }
    let cancelled = false
    setAdminChecked(false)
    Promise.allSettled([loadProfile(user), checkAdmin(user)]).then(([profileResult, adminResult]) => {
      if (cancelled) return
      setProfile(profileResult.status === 'fulfilled' ? profileResult.value : null)
      setIsAdmin(adminResult.status === 'fulfilled' && adminResult.value.isAdmin)
      setIsSuperAdmin(adminResult.status === 'fulfilled' && adminResult.value.isSuperAdmin)
      setAdminChecked(true)
    })
    return () => {
      cancelled = true
    }
    // Keyed on the user id so token refreshes do not re-run the checks.
  }, [userId, loading])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) throw new AppError(error.message)
  }, [])

  const signUp = useCallback(async ({ fullName, phone, email, password, birthday }: SignUpDetails) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: fullName.trim(), phone: phone.trim(), birthday } },
    })
    if (error) throw new AppError(error.message)
    return { needsConfirmation: !data.session }
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const saveProfile = useCallback<AuthState['saveProfile']>(
    async (patch) => {
      if (!userId) throw new AppError('Please sign in first.')
      const saved = unwrap<Profile>(
        await supabase
          .from('profiles')
          .upsert({ id: userId, ...patch, updated_at: new Date().toISOString() })
          .select()
          .single(),
      )
      setProfile(saved)
      return saved
    },
    [userId],
  )

  const value = useMemo<AuthState>(
    () => ({ session, user, profile, loading, isAdmin, isSuperAdmin, adminChecked, signIn, signUp, signOut, saveProfile }),
    [session, user, profile, loading, isAdmin, isSuperAdmin, adminChecked, signIn, signUp, signOut, saveProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
