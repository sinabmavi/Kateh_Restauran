export class AppError extends Error {
  code?: string
  constructor(message: string, code?: string) {
    super(message)
    this.name = 'AppError'
    this.code = code
  }
}

interface SupabaseLikeError {
  message: string
  code?: string
}

/** Returns `data` from a Supabase response or throws an AppError with a guest-friendly message. */
export function unwrap<T>(response: { data: unknown; error: SupabaseLikeError | null }): T {
  if (response.error) throw new AppError(friendlyMessage(response.error.message, response.error.code), response.error.code)
  return response.data as T
}

export function friendlyMessage(message: string, code?: string): string {
  if (message.includes('TABLE_ALREADY_BOOKED')) return 'That time was just taken, please pick another.'
  if (code === '23505') return 'That value already exists. Please choose a different one.'
  if (code === '23503') return 'This record is still in use, so it cannot be changed that way.'
  if (code === '23514') return 'Some of the values are not allowed. Please check the form.'
  if (code === '42501' || /row-level security/i.test(message)) return 'You do not have permission to do that.'
  if (/failed to fetch|networkerror|load failed/i.test(message)) return 'We could not reach the server. Please check your connection and try again.'
  return message
}

export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (error instanceof Error && error.message) return friendlyMessage(error.message, (error as AppError).code)
  if (typeof error === 'object' && error && 'message' in error && typeof (error as SupabaseLikeError).message === 'string') {
    const e = error as SupabaseLikeError
    return friendlyMessage(e.message, e.code)
  }
  return fallback
}

export function isSlotTakenError(error: unknown): boolean {
  if (error instanceof AppError && (error.code === 'SLOT_TAKEN' || error.code === 'TABLE_ALREADY_BOOKED')) return true
  return error instanceof Error && error.message.includes('TABLE_ALREADY_BOOKED')
}
