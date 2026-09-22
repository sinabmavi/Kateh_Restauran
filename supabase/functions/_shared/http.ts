import { corsHeaders } from './cors.ts'

/** An error that is safe to show to the guest: the status, a stable code for the client and a friendly message. */
export class HttpError extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.code = code
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) return json({ error: { code: error.code, message: error.message } }, error.status)
  console.error('Unhandled error', error)
  return json({ error: { code: 'INTERNAL', message: 'Something went wrong on our side. Please try again.' } }, 500)
}

/** Wraps a handler with CORS pre-flight, POST-only enforcement and uniform error responses. */
export function handle(handler: (request: Request) => Promise<Response>): (request: Request) => Promise<Response> {
  return async (request) => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    try {
      if (request.method !== 'POST') throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Use POST.')
      return await handler(request)
    } catch (error) {
      return errorResponse(error)
    }
  }
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json()
    if (body && typeof body === 'object' && !Array.isArray(body)) return body as Record<string, unknown>
  } catch {
    // fall through
  }
  throw new HttpError(400, 'BAD_REQUEST', 'The request body must be a JSON object.')
}

/* ------------------------------------------------- input validation */

export function text(value: unknown, field: string, { min = 0, max = 200 }: { min?: number; max?: number } = {}): string {
  const result = typeof value === 'string' ? value.trim() : ''
  if (result.length < min) throw new HttpError(400, 'INVALID_INPUT', `Please provide ${field}.`)
  if (result.length > max) throw new HttpError(400, 'INVALID_INPUT', `${field} is too long.`)
  return result
}

export function email(value: unknown): string {
  const result = text(value, 'a valid email address', { min: 3, max: 254 })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new HttpError(400, 'INVALID_INPUT', 'Please provide a valid email address.')
  return result
}

export function phone(value: unknown): string {
  const result = text(value, 'a phone number', { min: 5, max: 40 })
  if (result.replace(/\D/g, '').length < 7) throw new HttpError(400, 'INVALID_INPUT', 'Please provide a phone number we can reach you on.')
  return result
}

export function integer(value: unknown, field: string, min: number, max: number): number {
  const result = typeof value === 'number' ? value : Number.NaN
  if (!Number.isInteger(result) || result < min || result > max) throw new HttpError(400, 'INVALID_INPUT', `${field} is not valid.`)
  return result
}
