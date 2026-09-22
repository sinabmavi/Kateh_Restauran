import { useCallback } from 'react'
import { useCart } from '../context/CartContext'
import { useToast } from '../context/ToastContext'
import { useSettings } from '../context/SettingsContext'
import { isOrderable } from '../lib/categories'
import type { MenuItem } from '../lib/types'

/** Adds a dish to the cart with a confirmation toast. Ordering can be paused from the dashboard. */
export function useAddToCart() {
  const { add } = useCart()
  const toast = useToast()
  const { settings } = useSettings()
  const orderingEnabled = settings?.ordering_enabled ?? false

  const addItem = useCallback(
    (item: MenuItem, quantity = 1, notes = '') => {
      if (!orderingEnabled) {
        toast.info('Online ordering is paused right now. Please check back soon.')
        return
      }
      if (!isOrderable(item)) {
        toast.error(`${item.name} is not available to order right now.`)
        return
      }
      add(item, quantity, notes)
      toast.success(`${item.name} added to your cart`)
    },
    [add, orderingEnabled, toast],
  )

  return { addItem, orderingEnabled }
}
