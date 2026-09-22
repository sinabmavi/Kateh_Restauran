import { createClient } from '@supabase/supabase-js'
import { env } from './env'

// This module is only loaded after `main.tsx` has confirmed the environment is configured.
export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})
