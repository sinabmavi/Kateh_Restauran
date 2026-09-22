import { useRef } from 'react'
import { PayPalButtons, PayPalScriptProvider, usePayPalScriptReducer } from '@paypal/react-paypal-js'
import { captureCheckout } from '../lib/api'
import { env, paypalEnabled } from '../lib/env'
import { AppError, errorMessage } from '../lib/errors'
import type { CaptureResponse } from '../lib/types'
import { useToast } from '../context/ToastContext'
import { Skeleton } from './ui/primitives'

/** Thrown by `createOrder` when the flow already finished without needing PayPal after all. */
export const FLOW_HANDLED = 'FLOW_HANDLED'

interface Handlers {
  /** Creates the order on the server (never trust the browser for amounts) and returns the PayPal order id. */
  createOrder: () => Promise<string>
  onCaptured: (result: CaptureResponse) => void
  /** Called when PayPal or the server rejects the flow, after the guest has been told. */
  onFailure?: (error: unknown) => void
}

interface PayPalCheckoutProps extends Handlers {
  currency: string
  disabled: boolean
}

function Buttons({ disabled, ...handlers }: Handlers & { disabled: boolean }) {
  const [{ isPending, isRejected }] = usePayPalScriptReducer()
  const toast = useToast()
  // PayPal keeps the callbacks it was rendered with, so always call through a ref to read fresh form data.
  const latest = useRef(handlers)
  latest.current = handlers
  const reported = useRef(false)

  if (isRejected) {
    return (
      <div className="notice notice--danger" role="alert">
        PayPal could not be loaded. Please check your connection, disable any content blockers and reload the page.
      </div>
    )
  }

  return (
    <div className={`paypal${disabled ? ' is-disabled' : ''}`}>
      {isPending && <Skeleton style={{ height: 48, borderRadius: 999 }} />}
      <PayPalButtons
        style={{ layout: 'vertical', shape: 'pill', color: 'gold', label: 'pay', height: 48, tagline: false }}
        disabled={disabled}
        forceReRender={[disabled]}
        createOrder={async () => {
          reported.current = false
          try {
            return await latest.current.createOrder()
          } catch (error) {
            // PayPal also calls onError after a rejected createOrder; `reported` stops a second, generic message.
            reported.current = true
            if (!(error instanceof AppError && error.code === FLOW_HANDLED)) {
              toast.error(errorMessage(error, 'We could not start the payment. Please try again.'))
              latest.current.onFailure?.(error)
            }
            throw error
          }
        }}
        onApprove={async (data) => {
          try {
            latest.current.onCaptured(await captureCheckout(data.orderID))
          } catch (error) {
            toast.error(`${errorMessage(error, 'We could not confirm your payment.')} If PayPal shows a charge, please contact us and quote ${data.orderID}.`)
            latest.current.onFailure?.(error)
          }
        }}
        onCancel={() => toast.info('Payment cancelled. You have not been charged.')}
        onError={() => {
          if (reported.current) {
            reported.current = false
            return
          }
          toast.error('PayPal could not complete the payment. You have not been charged. Please try again.')
        }}
      />
    </div>
  )
}

export function PayPalCheckout({ currency, ...rest }: PayPalCheckoutProps) {
  if (!paypalEnabled) {
    return (
      <div className="notice" role="status">
        Online payment isn&rsquo;t set up yet. Add a PayPal client id to <code>VITE_PAYPAL_CLIENT_ID</code> to take
        payments here.
      </div>
    )
  }

  return (
    <PayPalScriptProvider key={currency} options={{ clientId: env.paypalClientId, currency, intent: 'capture' }}>
      <Buttons {...rest} />
    </PayPalScriptProvider>
  )
}
