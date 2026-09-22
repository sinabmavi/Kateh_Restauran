import { Link } from 'react-router-dom'
import { ChevronRight, ShoppingBag } from 'lucide-react'
import { useCart } from '../context/CartContext'
import { useSettings } from '../context/SettingsContext'
import { formatMoney, pluralise } from '../lib/format'

/** "View cart · 3 items · $42.00", pinned above the bottom navigation. */
export function StickyCartBar() {
  const { count, subtotal, addedTick } = useCart()
  const { settings } = useSettings()
  if (count === 0) return null

  return (
    <Link to="/cart" className="cartbar" aria-label={`View cart, ${pluralise(count, 'item')}`}>
      <span key={addedTick} className="cartbar__icon">
        <ShoppingBag size={20} />
      </span>
      <span className="cartbar__text">
        View cart · {pluralise(count, 'item')} · <strong>{formatMoney(subtotal, settings?.currency)}</strong>
      </span>
      <ChevronRight size={20} />
    </Link>
  )
}
