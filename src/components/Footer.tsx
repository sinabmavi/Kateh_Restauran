import { Link } from 'react-router-dom'
import { Lock, Mail, MapPin, Phone } from 'lucide-react'
import { useSettings } from '../context/SettingsContext'
import { telHref } from '../lib/format'
import { Logo } from './Logo'
import { OpeningHours } from './OpeningHours'

export function Footer() {
  const { settings } = useSettings()
  if (!settings) return null

  return (
    <footer className="footer">
      <div className="container footer__grid">
        <div className="footer__brand">
          <Logo light />
          <p className="footer__lede">Delivery, pickup and tables, all in one place.</p>
          <ul className="footer__contact">
            {settings.restaurant_address && (
              <li>
                <MapPin size={16} aria-hidden /> {settings.restaurant_address}
              </li>
            )}
            {settings.restaurant_phone && (
              <li>
                <Phone size={16} aria-hidden /> <a href={telHref(settings.restaurant_phone)}>{settings.restaurant_phone}</a>
              </li>
            )}
            {settings.restaurant_email && (
              <li>
                <Mail size={16} aria-hidden /> <a href={`mailto:${settings.restaurant_email}`}>{settings.restaurant_email}</a>
              </li>
            )}
          </ul>
        </div>

        <div>
          <h3 className="footer__title">Opening hours</h3>
          <OpeningHours tone="dark" />
        </div>

        <div>
          <h3 className="footer__title">Explore</h3>
          <ul className="footer__links">
            <li>
              <Link to="/menu">Menu</Link>
            </li>
            <li>
              <Link to="/reserve">Reserve a table</Link>
            </li>
            <li>
              <Link to="/cart">Your order</Link>
            </li>
            <li>
              <Link to="/account">My account</Link>
            </li>
          </ul>
          <p className="footer__secure">
            <Lock size={14} aria-hidden /> Secure payments by <strong>PayPal</strong>
          </p>
        </div>
      </div>
      <div className="container footer__base">
        <span>
          © {new Date().getFullYear()} {settings.restaurant_name}
        </span>
        <Link to="/admin" className="footer__admin">
          Admin
        </Link>
      </div>
    </footer>
  )
}
