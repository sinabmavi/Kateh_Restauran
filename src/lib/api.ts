import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { AppError } from './errors'
import type {
  CaptureResponse,
  OrderCheckoutRequest,
  OrderCheckoutResponse,
  ReservationCheckoutRequest,
  ReservationCheckoutResponse,
} from './types'

async function callFunction<T>(name: 'create-checkout' | 'capture-checkout', body: unknown): Promise<T> {
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
