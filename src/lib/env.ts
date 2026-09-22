const PLACEHOLDER = /^PASTE_YOUR_/i

const read = (value: string | undefined): string => {
  const trimmed = (value ?? '').trim()
  return PLACEHOLDER.test(trimmed) ? '' : trimmed
}

export const env = {
  supabaseUrl: read(import.meta.env.VITE_SUPABASE_URL),
  supabaseAnonKey: read(import.meta.env.VITE_SUPABASE_ANON_KEY),
  paypalClientId: read(import.meta.env.VITE_PAYPAL_CLIENT_ID),
}

// PayPal is deliberately not required to boot the app: the site, menu, cart, reservations browsing
// and admin dashboard all work without it. Only the payment buttons themselves need a real client id
// (see PayPalCheckout.tsx, which shows a "not configured yet" notice instead of loading the SDK).
const REQUIRED: Array<[keyof typeof env, string]> = [
  ['supabaseUrl', 'VITE_SUPABASE_URL'],
  ['supabaseAnonKey', 'VITE_SUPABASE_ANON_KEY'],
]

/** Names of the environment variables that are missing or still hold the placeholder text. */
export const missingEnv: string[] = REQUIRED.filter(([key]) => !env[key]).map(([, name]) => name)

/** Whether real PayPal payments can be attempted. */
export const paypalEnabled = Boolean(env.paypalClientId)
