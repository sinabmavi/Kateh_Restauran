// CORS for calls from the browser. The functions use bearer tokens (never cookies), so a wildcard origin is safe.
// To lock this down to your own site, replace '*' with your production origin.
export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}
