// manage-admins: list, add, edit and remove dashboard admins. Only a signed-in super admin may call it.
// Logins are created with the service role, which never leaves this function.
import type { SupabaseClient, User } from 'npm:@supabase/supabase-js@2'
import { getUser, serviceClient } from '../_shared/clients.ts'
import { HttpError, email, handle, json, readJson, text } from '../_shared/http.ts'

type Role = 'admin' | 'super_admin'

interface AdminRow {
  user_id: string
  role: Role
  full_name: string | null
  created_at: string
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function readRole(value: unknown): Role {
  if (value === 'admin' || value === 'super_admin') return value
  throw new HttpError(400, 'INVALID_INPUT', 'Please choose a role.')
}

function readPassword(value: unknown, required: boolean): string | null {
  const result = typeof value === 'string' ? value : ''
  if (!result && !required) return null
  if (result.length < 8) throw new HttpError(400, 'INVALID_INPUT', 'The password must be at least 8 characters.')
  if (result.length > 72) throw new HttpError(400, 'INVALID_INPUT', 'The password is too long (72 characters at most).')
  return result
}

function readUserId(value: unknown): string {
  if (typeof value === 'string' && UUID.test(value)) return value
  throw new HttpError(400, 'INVALID_INPUT', 'Unknown admin.')
}

function isEmailTaken(message: string | undefined): boolean {
  return /already (been )?registered|already exists|email_exists/i.test(message ?? '')
}

async function requireSuperAdmin(admin: SupabaseClient, request: Request): Promise<User> {
  const caller = await getUser(admin, request)
  if (!caller) throw new HttpError(401, 'UNAUTHORIZED', 'Please sign in again.')
  const { data } = await admin.from('admin_users').select('role').eq('user_id', caller.id).maybeSingle()
  if (data?.role !== 'super_admin') throw new HttpError(403, 'FORBIDDEN', 'Only the super admin can manage admins.')
  return caller
}

async function findAdmin(admin: SupabaseClient, userId: string): Promise<AdminRow> {
  const { data, error } = await admin.from('admin_users').select('user_id, role, full_name, created_at').eq('user_id', userId).maybeSingle()
  if (error) throw new HttpError(500, 'DB', 'Could not load that admin.')
  if (!data) throw new HttpError(404, 'NOT_FOUND', 'That admin no longer exists.')
  return data as AdminRow
}

async function superAdminCount(admin: SupabaseClient): Promise<number> {
  const { count } = await admin.from('admin_users').select('user_id', { count: 'exact', head: true }).eq('role', 'super_admin')
  return count ?? 0
}

async function listAdmins(admin: SupabaseClient) {
  const { data, error } = await admin.from('admin_users').select('user_id, role, full_name, created_at').order('created_at', { ascending: true })
  if (error) throw new HttpError(500, 'DB', 'Could not load the admins.')
  const rows = (data ?? []) as AdminRow[]
  const accounts = await Promise.all(rows.map((row) => admin.auth.admin.getUserById(row.user_id)))
  return rows.map((row, index) => {
    const account = accounts[index].data.user
    return {
      user_id: row.user_id,
      full_name: row.full_name,
      role: row.role,
      created_at: row.created_at,
      email: account?.email ?? null,
      last_sign_in_at: account?.last_sign_in_at ?? null,
    }
  })
}

async function createAdmin(admin: SupabaseClient, body: Record<string, unknown>) {
  const fullName = text(body.full_name, 'a name', { min: 2, max: 120 })
  const address = email(body.email).toLowerCase()
  const password = readPassword(body.password, true)!
  const role = readRole(body.role)

  const created = await admin.auth.admin.createUser({ email: address, password, email_confirm: true, user_metadata: { full_name: fullName } })
  if (created.error || !created.data.user) {
    if (isEmailTaken(created.error?.message)) throw new HttpError(409, 'EMAIL_TAKEN', 'An account with this email already exists. Please use a different email.')
    console.error('createUser failed', created.error)
    throw new HttpError(500, 'AUTH', 'Could not create the login. Please try again.')
  }

  const userId = created.data.user.id
  const inserted = await admin.from('admin_users').insert({ user_id: userId, role, full_name: fullName })
  if (inserted.error) {
    console.error('admin_users insert failed', inserted.error)
    await admin.auth.admin.deleteUser(userId)
    throw new HttpError(500, 'DB', 'Could not save the new admin. Please try again.')
  }
  return { user_id: userId }
}

async function updateAdmin(admin: SupabaseClient, body: Record<string, unknown>) {
  const userId = readUserId(body.user_id)
  const current = await findAdmin(admin, userId)
  const fullName = text(body.full_name, 'a name', { min: 2, max: 120 })
  const address = email(body.email).toLowerCase()
  const password = readPassword(body.password, false)
  const role = readRole(body.role)

  if (current.role === 'super_admin' && role !== 'super_admin' && (await superAdminCount(admin)) <= 1) {
    throw new HttpError(409, 'LAST_SUPER_ADMIN', 'There must always be at least one super admin.')
  }

  const account = await admin.auth.admin.getUserById(userId)
  const patch: { email?: string; email_confirm?: boolean; password?: string; user_metadata?: Record<string, unknown> } = {
    user_metadata: { ...(account.data.user?.user_metadata ?? {}), full_name: fullName },
  }
  if (account.data.user?.email?.toLowerCase() !== address) {
    patch.email = address
    patch.email_confirm = true
  }
  if (password) patch.password = password

  const updated = await admin.auth.admin.updateUserById(userId, patch)
  if (updated.error) {
    if (isEmailTaken(updated.error.message)) throw new HttpError(409, 'EMAIL_TAKEN', 'Another account already uses this email.')
    console.error('updateUserById failed', updated.error)
    throw new HttpError(500, 'AUTH', 'Could not update the login. Please try again.')
  }

  const saved = await admin.from('admin_users').update({ full_name: fullName, role }).eq('user_id', userId)
  if (saved.error) {
    console.error('admin_users update failed', saved.error)
    throw new HttpError(500, 'DB', 'Could not save the changes. Please try again.')
  }
  return { user_id: userId }
}

async function removeAdmin(admin: SupabaseClient, caller: User, body: Record<string, unknown>) {
  const userId = readUserId(body.user_id)
  if (userId === caller.id) throw new HttpError(400, 'SELF', 'You cannot remove your own admin access.')
  const current = await findAdmin(admin, userId)
  if (current.role === 'super_admin' && (await superAdminCount(admin)) <= 1) {
    throw new HttpError(409, 'LAST_SUPER_ADMIN', 'There must always be at least one super admin.')
  }
  const removed = await admin.from('admin_users').delete().eq('user_id', userId)
  if (removed.error) {
    console.error('admin_users delete failed', removed.error)
    throw new HttpError(500, 'DB', 'Could not remove this admin. Please try again.')
  }
  return { user_id: userId }
}

Deno.serve(
  handle(async (request) => {
    const body = await readJson(request)
    const admin = serviceClient()
    const caller = await requireSuperAdmin(admin, request)

    switch (body.action) {
      case 'list':
        return json({ admins: await listAdmins(admin) })
      case 'create':
        return json(await createAdmin(admin, body))
      case 'update':
        return json(await updateAdmin(admin, body))
      case 'remove':
        return json(await removeAdmin(admin, caller, body))
      default:
        throw new HttpError(400, 'BAD_REQUEST', 'Unknown action.')
    }
  }),
)
