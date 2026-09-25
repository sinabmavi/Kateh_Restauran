import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { AppError } from './errors'
import type {
  AdminAccount,
  AdminAccountInput,
  CaptureResponse,
  Id,
  OrderCheckoutRequest,
  OrderCheckoutResponse,
  ReservationCheckoutRequest,
  ReservationCheckoutResponse,
} from './types'

async function callFunction<T>(name: 'create-checkout' | 'capture-checkout' | 'manage-admins' | 'marketing-email', body: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body: body as Record<string, unknown> })
  if (!error) return data as T

  if (error instanceof FunctionsHttpError) {
    const payload = await error.context.json().catch(() => null)
    const detail = payload?.error
    if (detail?.message) throw new AppError(detail.message, detail.code)
    throw new AppError('The server could not complete that request. Please try again.')
  }
  if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) {
    throw new AppError('We could not reach the server. Please check your connection and try again.')
  }
  throw new AppError(error.message)
}

export function createOrderCheckout(request: OrderCheckoutRequest) {
  return callFunction<OrderCheckoutResponse>('create-checkout', request)
}

export function createReservationCheckout(request: ReservationCheckoutRequest) {
  return callFunction<ReservationCheckoutResponse>('create-checkout', request)
}

export function captureCheckout(paypalOrderId: string) {
  return callFunction<CaptureResponse>('capture-checkout', { paypalOrderId })
}

export async function listAdmins(): Promise<AdminAccount[]> {
  return (await callFunction<{ admins: AdminAccount[] }>('manage-admins', { action: 'list' })).admins
}

export function createAdmin(input: AdminAccountInput) {
  return callFunction<{ user_id: Id }>('manage-admins', { action: 'create', ...input })
}

/** An empty password keeps the current one. */
export function updateAdmin(userId: Id, input: AdminAccountInput) {
  return callFunction<{ user_id: Id }>('manage-admins', { action: 'update', user_id: userId, ...input })
}

export function removeAdmin(userId: Id) {
  return callFunction<{ user_id: Id }>('manage-admins', { action: 'remove', user_id: userId })
}

/* ---------------------------------------------------------- Email Marketing */

export interface SendResult {
  run_id: string | null
  recipients: number
  sent: number
  failed: number
  firstError: string | null
}

export function marketingSendNow(emailId: Id) {
  return callFunction<SendResult>('marketing-email', { action: 'send_now', email_id: emailId })
}

export function marketingRunNow(emailId: Id) {
  return callFunction<SendResult>('marketing-email', { action: 'run_now', email_id: emailId })
}

export function marketingRetryFailed(runId: Id) {
  return callFunction<{ retried: number; sent: number; failed: number; firstError: string | null }>('marketing-email', { action: 'retry_failed', run_id: runId })
}

export function marketingSendTest(message: unknown) {
  return callFunction<{ results: Array<{ to: string; ok: boolean; error?: string }> }>('marketing-email', { action: 'send_test', message })
}

export function setEmailSubscription(userId: string, token: string, subscribed: boolean) {
  return callFunction<{ ok: boolean; subscribed: boolean }>('marketing-email', { action: subscribed ? 'resubscribe' : 'unsubscribe', u: userId, t: token })
}