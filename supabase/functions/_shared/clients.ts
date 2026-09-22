import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2'
import { HttpError } from './http.ts'

/** Service-role client. Bypasses RLS, so it is only ever used here, after the request has been validated. */
export function serviceClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new HttpError(500, 'MISCONFIGURED', 'The server is missing its Supabase configuration.')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

/**
 * The signed-in customer, or null for guests. The browser sends its access token as a bearer token; a publishable
 * key (sent when nobody is signed in) is not a valid user token, so it resolves to null.
 */
export async function getUser(admin: SupabaseClient, request: Request): Promise<User | null> {
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim()
  if (!token) return null
  const { data, error } = await admin.auth.getUser(token)
  return error ? null : data.user
}
