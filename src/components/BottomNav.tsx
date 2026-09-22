import { NavLink } from 'react-router-dom'
import { CalendarDays, Ellipsis, House, ShoppingBag, UtensilsCrossed } from 'lucide-react'
import { useCart } from '../context/CartContext'

const ITEMS = [
  { to: '/', label: 'Home', icon: House, end: true },
  { to: '/menu', label: 'Menu', icon: UtensilsCrossed, end: false },
  { to: '/cart', label: 'Order', icon: ShoppingBag, end: false, centre: true },
  { to: '/reserve', label: 'Reservations', icon: CalendarDays, end: false },
  { to: '/more', label: 'More', icon: Ellipsis, end: false },
]

export function BottomNav() {
  const { count, addedTick } = useCart()
  return (
    <nav className="bottomnav" aria-label="Primary">
      {ITEMS.map(({ to, label, icon: Icon, end, centre }) => (
        <NavLink key={to} to={to} end={end} className={({ isActive }) => `bottomnav__item${centre ? ' bottomnav__item--centre' : ''}${isActive ? ' is-active' : ''}`}>
          <span className="bottomnav__icon">
            <Icon size={centre ? 26 : 23} strokeWidth={centre ? 2 : 1.8} />
            {centre && count > 0 && (
              <span key={addedTick} className="count-badge count-badge--bump count-badge--on-gold">
                {count}
              </span>
            )}
          </span>
          <span className="bottomnav__label">{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
