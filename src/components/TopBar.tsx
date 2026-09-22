import { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { CalendarDays, Home, LogIn, LogOut, Mail, MapPin, Menu as MenuIcon, Phone, ShieldCheck, ShoppingBag, User, UtensilsCrossed } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useCart } from '../context/CartContext'
import { useSettings } from '../context/SettingsContext'
import { telHref } from '../lib/format'
import { Logo } from './Logo'
import { Sheet } from './ui/Sheet'

const LINKS = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/menu', label: 'Menu', icon: UtensilsCrossed, end: false },
  { to: '/reserve', label: 'Reservations', icon: CalendarDays, end: false },
  { to: '/more', label: 'More', icon: MenuIcon, end: false },
]

export function TopBar() {
  const [open, setOpen] = useState(false)
  const { count, addedTick } = useCart()
  const { user, isAdmin, signOut } = useAuth()
  const { settings } = useSettings()
  const navigate = useNavigate()

  return (
    <header className="topbar">
      <div className="topbar__inner container">
        <button type="button" className="icon-btn topbar__burger" aria-label="Open menu" onClick={() => setOpen(true)}>
          <MenuIcon size={24} />
        </button>

        <Logo />

        <nav className="topbar__nav" aria-label="Main">
          {LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.end} className={({ isActive }) => `topbar__link${isActive ? ' is-active' : ''}`}>
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="topbar__actions">
          <Link to={user ? '/account' : '/login'} className="icon-btn" aria-label={user ? 'My account' : 'Sign in'}>
            <User size={23} />
          </Link>
          <Link to="/cart" className="icon-btn" aria-label={`Cart, ${count} items`}>
            <ShoppingBag size={23} />
            {count > 0 && (
              <span key={addedTick} className="count-badge count-badge--bump">
                {count}
              </span>
            )}
          </Link>
          <Link to="/reserve" className="btn btn--gold btn--sm topbar__cta">
            Book a table
          </Link>
        </div>
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} title={settings?.restaurant_name ?? 'Menu'} placement="left">
        <nav className="drawer-nav" aria-label="Menu">
          {LINKS.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} onClick={() => setOpen(false)} className={({ isActive }) => `drawer-nav__link${isActive ? ' is-active' : ''}`}>
              <Icon size={20} />
              {label}
            </NavLink>
          ))}
          <NavLink to="/cart" onClick={() => setOpen(false)} className="drawer-nav__link">
            <ShoppingBag size={20} />
            Cart {count > 0 && <span className="badge badge--gold">{count}</span>}
          </NavLink>
          <NavLink to={user ? '/account' : '/login'} onClick={() => setOpen(false)} className="drawer-nav__link">
            {user ? <User size={20} /> : <LogIn size={20} />}
            {user ? 'My account' : 'Sign in or create account'}
          </NavLink>
          {isAdmin && (
            <NavLink to="/admin" onClick={() => setOpen(false)} className="drawer-nav__link">
              <ShieldCheck size={20} />
              Admin dashboard
            </NavLink>
          )}
          {user && (
            <button
              type="button"
              className="drawer-nav__link"
              onClick={async () => {
                setOpen(false)
                await signOut()
                navigate('/')
              }}
            >
              <LogOut size={20} />
              Sign out
            </button>
          )}
        </nav>
        {settings && (
          <div className="drawer-contact">
            {settings.restaurant_phone && (
              <a href={telHref(settings.restaurant_phone)}>
                <Phone size={16} /> {settings.restaurant_phone}
              </a>
            )}
            {settings.restaurant_email && (
              <a href={`mailto:${settings.restaurant_email}`}>
                <Mail size={16} /> {settings.restaurant_email}
              </a>
            )}
            {settings.restaurant_address && (
              <span>
                <MapPin size={16} /> {settings.restaurant_address}
              </span>
            )}
          </div>
        )}
      </Sheet>
    </header>
  )
}
