import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Armchair,
  Bell,
  BellOff,
  CalendarCheck,
  CalendarOff,
  ChartColumn,
  ChevronDown,
  Clock,
  CreditCard,
  ExternalLink,
  Gift,
  HeartHandshake,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu as MenuIcon,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Trophy,
  Users,
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

const CLUB_BASE = '/admin/club'

const CLUB = [
  { to: `${CLUB_BASE}/customers`, label: 'Customers', icon: Users },
  { to: `${CLUB_BASE}/loyalty`, label: 'Loyalty & Rewards', icon: Gift },
  { to: `${CLUB_BASE}/games`, label: 'Games & Missions', icon: Trophy },
  { to: `${CLUB_BASE}/email`, label: 'Email Marketing', icon: Mail },
  { to: `${CLUB_BASE}/analytics`, label: 'Customer Analytics', icon: ChartColumn },
]

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const { awaiting } = useAdminOrders()
  const { isSuperAdmin } = useAuth()
  const location = useLocation()
  const inClub = location.pathname.startsWith(CLUB_BASE)
  const [clubOpen, setClubOpen] = useState(inClub)

  useEffect(() => {
    if (inClub) setClubOpen(true)
  }, [inClub])

  const renderLink = ({ to, label, icon: Icon, end, badge }: (typeof NAV)[number]) => (
    <NavLink key={to} to={to} end={end} onClick={onNavigate} className={({ isActive }) => `snav__link${isActive ? ' is-active' : ''}`}>
      <Icon size={19} />
      <span>{label}</span>
      {badge && awaiting > 0 && <span className="snav__badge">{awaiting}</span>}
    </NavLink>
  )

  return (
    <nav className="snav" aria-label="Dashboard">
      {NAV.filter((item) => !item.superOnly).map(renderLink)}

      <div className={`snav__group${clubOpen ? ' is-open' : ''}${inClub ? ' has-active' : ''}`}>
        <button type="button" className="snav__link snav__group-toggle" aria-expanded={clubOpen} aria-controls="snav-club" onClick={() => setClubOpen((open) => !open)}>
          <HeartHandshake size={19} />
          <span>Customer Club</span>
          <ChevronDown size={17} className="snav__chevron" aria-hidden />
        </button>
        <div id="snav-club" className="snav__sub" role="group" aria-label="Customer Club">
          <div className="snav__sub-inner">
            {CLUB.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} onClick={onNavigate} tabIndex={clubOpen ? undefined : -1} className={({ isActive }) => `snav__link snav__sublink${isActive ? ' is-active' : ''}`}>
                <Icon size={17} />
                <span>{label}</span>
              </NavLink>
            ))}
          </div>
        </div>
      </div>

      {isSuperAdmin && NAV.filter((item) => item.superOnly).map(renderLink)}
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

  const current = [...NAV, ...CLUB].find((item) => ('end' in item && item.end ? location.pathname === item.to : location.pathname.startsWith(item.to)))

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
