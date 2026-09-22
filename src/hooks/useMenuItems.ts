import { useEffect } from 'react'
import { fetchActiveMenuItems } from '../lib/data'
import { useCart } from '../context/CartContext'
import { useToast } from '../context/ToastContext'
import { useAsync } from './useAsync'

/** Active menu items from Supabase. Also keeps the cart in step with current prices and availability. */
export function useMenuItems() {
  const state = useAsync(fetchActiveMenuItems, [])
  const { reconcile } = useCart()
  const toast = useToast()

  useEffect(() => {
    if (!state.data) return
    const { removed, repriced } = reconcile(state.data)
    if (removed.length) toast.info(`No longer available and removed from your cart: ${removed.join(', ')}`)
    else if (repriced.length) toast.info(`Prices updated for: ${repriced.join(', ')}`)
    // reconcile and toast are stable; only re-run when fresh menu data arrives.
  }, [state.data])

  return state
}
