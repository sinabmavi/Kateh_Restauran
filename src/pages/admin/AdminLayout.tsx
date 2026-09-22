import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Armchair,
  Bell,
  BellOff,
  CalendarCheck,
  CalendarOff,
  Clock,
  CreditCard,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  Menu as MenuIcon,
  Settings,
  ShieldCheck,
  ShoppingBag,
  UtensilsCrossed,
} from 'lucide-react'
import { Emblem } from '../../components/Emblem'
import { Sheet } from '../../components/ui/Sheet'
import { useAuth } from '../../context/AuthContext'
import { useSettings } from '../../context/SettingsContext'
import { useAdminOrders } from './AdminOrdersContext'

const NAV = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/admin/orders', label: 'Orders', icon: ShoppingBag, end: false, badge: true },
  { to: '/admin/payments', label: 'Payments', icon: CreditCard, end: false },
  { to: '/admin/reservations', label: 'Reservations', icon: CalendarCheck, end: false },
  { to: '/admin/tables', label: 'Restaurant Tables', icon: Armchair, end: false },
  { to: '/admin/menu', label: 'Menu Items', icon: UtensilsCrossed, end: false },
  { to: '/admin/hours', label: 'Business Hours', icon: Clock, end: false },
  { to: '/admin/blocked-dates', label: 'Blocked Dates', icon: CalendarOff, end: false },
  { to: '/admin/settings', label: 'Restaurant Settings', icon: Settings, end: false },
  { to: '/admin/admins', label: 'Admins', icon: ShieldCheck, end: false, superOnly: true },
]

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const { awaiting } = useAdminOrders()
  const { isSuperAdmin } = useAuth()
  return (
    <nav className="snav" aria-label="Dashboard">
      {NAV.filter((item) => !item.superOnly || isSuperAdmin).map(({ to, label, icon: Icon, end, badge }) => (
        <NavLink key={to} to={to} end={end} onClick={onNavigate} className={({ isActive }) => `snav__link${isActive ? ' is-active' : ''}`}>
          <Icon size={19} />
          <span>{label}</span>
          {badge && awaiting > 0 && <span className="snav__badge">{awaiting}</span>}
        </NavLink>
      ))}
    </nav>
  )
}

export default function AdminLayout() {
  const { awaiting, freshIds, soundOn, toggleSound } = useAdminOrders()
  const { user, signOut } = useAuth()
  const { settings } = useSettings()
  const [drawer, setDrawer] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()

  const current = NAV.find((item) => (item.end ? location.pathname === item.to : location.pathname.startsWith(item.to)))

  useEffect(() => {
    const name = settings?.restaurant_name ?? 'Dashboard'
    document.title = `${awaiting > 0 ? `(${awaiting}) ` : ''}${current?.label ?? 'Dashboard'} · ${name}`
  }, [awaiting, current, settings?.restaurant_name])

  const handleSignOut = async () => {
    await signOut()
    navigate('/admin/login')
  }

  return (
    <div className="admin">
      <aside className="admin__sidebar">
        <div className="admin__brand">
          <Emblem size={30} />
          <div>
            <strong>{settings?.restaurant_name}</strong>
            <span>Dashboard</span>
          </div>
        </div>
        <NavList />
        <div className="admin__sidefoot">
          <a href="/" target="_blank" rel="noreferrer" className="snav__link">
            <ExternalLink size={19} />
            <span>View website</span>
          </a>
          <button type="button" className="snav__link" onClick={() => void handleSignOut()}>
            <LogOut size={19} />
            <span>Sign out</span>
          </button>
          <p className="admin__user">{user?.email}</p>
        </div>
      </aside>

      <div className="admin__body">
        <header className="admin__bar">
          <button type="button" className="icon-btn admin__burger" aria-label="Open navigation" onClick={() => setDrawer(true)}>
            <MenuIcon size={24} />
            {awaiting > 0 && <span className="count-badge">{awaiting}</span>}
          </button>
          <h1 className="admin__bar-title">{current?.label ?? 'Dashboard'}</h1>
          <div className="admin__bar-actions">
            <button type="button" className={`btn btn--sm ${soundOn ? 'btn--soft' : 'btn--ghost'}`} onClick={() => void toggleSound()} aria-pressed={soundOn}>
              {soundOn ? <Bell size={16} /> : <BellOff size={16} />}
              <span className="admin__bar-label">{soundOn ? 'Sound on' : 'Sound off'}</span>
            </button>
          </div>
        </header>

        {freshIds.size > 0 && location.pathname !== '/admin/orders' && (
          <button type="button" className="new-order-banner" onClick={() => navigate('/admin/orders')}>
            <Bell size={18} />
            <strong>{freshIds.size === 1 ? 'New order' : `${freshIds.size} new orders`}</strong>
            <span>Tap to review and accept</span>
          </button>
        )}

        <main className="admin__main">
          <Outlet />
        </main>
      </div>

      <Sheet open={drawer} onClose={() => setDrawer(false)} title={settings?.restaurant_name ?? 'Dashboard'} placement="left">
        <NavList onNavigate={() => setDrawer(false)} />
        <div className="drawer-contact">
          <a href="/" target="_blank" rel="noreferrer">
            <ExternalLink size={16} /> View website
          </a>
          <button type="button" className="drawer-nav__link" onClick={() => void handleSignOut()}>
            <LogOut size={20} /> Sign out
          </button>
        </div>
      </Sheet>
    </div>
  )
}
