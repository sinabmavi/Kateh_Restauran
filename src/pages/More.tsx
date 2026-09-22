import { Link, useNavigate } from 'react-router-dom'
import { CalendarDays, ChevronRight, Clock, LogIn, LogOut, Mail, MapPin, Phone, ShieldCheck, User } from 'lucide-react'
import { OpeningHours } from '../components/OpeningHours'
import { useAuth } from '../context/AuthContext'
import { useRequiredSettings } from '../context/SettingsContext'
import { useDocumentMeta } from '../hooks/useDocumentMeta'
import { telHref } from '../lib/format'

export default function MorePage() {
  const settings = useRequiredSettings()
  const { user, profile, isAdmin, signOut } = useAuth()
  const navigate = useNavigate()
  useDocumentMeta('More')

  return (
    <div className="container page more">
      <header className="page__head">
        <h1 className="page__title">More</h1>
      </header>

      <div className="more__grid">
        <section className="card card--pad more__account">
          {user ? (
            <>
              <span className="more__avatar">
                <User size={26} />
              </span>
              <div>
                <p className="more__name">{profile?.full_name || user.email}</p>
                <p className="muted-note">{user.email}</p>
              </div>
              <Link to="/account" className="btn btn--dark btn--sm">
                My account
              </Link>
            </>
          ) : (
            <>
              <span className="more__avatar">
                <LogIn size={24} />
              </span>
              <div>
                <p className="more__name">Sign in</p>
                <p className="muted-note">Track orders and see your reservations.</p>
              </div>
              <Link to="/login" className="btn btn--gold btn--sm">
                Sign in
              </Link>
            </>
          )}
        </section>

        <nav className="card more__links" aria-label="Shortcuts">
          <Link to="/reserve" className="more__link">
            <CalendarDays size={20} /> Reserve a table <ChevronRight size={18} />
          </Link>
          {isAdmin && (
            <Link to="/admin" className="more__link">
              <ShieldCheck size={20} /> Admin dashboard <ChevronRight size={18} />
            </Link>
          )}
          {user && (
            <button
              type="button"
              className="more__link"
              onClick={async () => {
                await signOut()
                navigate('/')
              }}
            >
              <LogOut size={20} /> Sign out <ChevronRight size={18} />
            </button>
          )}
        </nav>

        <section className="card card--pad">
          <h2 className="checkout__h">Find us</h2>
          <ul className="contact-list">
            {settings.restaurant_address && (
              <li>
                <MapPin size={18} /> {settings.restaurant_address}
              </li>
            )}
            {settings.restaurant_phone && (
              <li>
                <Phone size={18} /> <a href={telHref(settings.restaurant_phone)}>{settings.restaurant_phone}</a>
              </li>
            )}
            {settings.restaurant_email && (
              <li>
                <Mail size={18} /> <a href={`mailto:${settings.restaurant_email}`}>{settings.restaurant_email}</a>
              </li>
            )}
          </ul>
        </section>

        <section className="card card--pad">
          <h2 className="checkout__h">
            <Clock size={18} /> Opening hours
          </h2>
          <OpeningHours />
        </section>
      </div>
    </div>
  )
}
