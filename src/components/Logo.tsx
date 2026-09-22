import { Link } from 'react-router-dom'
import { brandCopy } from '../lib/brand'
import { Emblem } from './Emblem'
import { useSettings } from '../context/SettingsContext'

export function Logo({ light }: { light?: boolean }) {
  const { settings } = useSettings()
  return (
    <Link to="/" className={`logo${light ? ' logo--light' : ''}`} aria-label={`${settings?.restaurant_name ?? 'Restaurant'} home`}>
      <Emblem />
      <span className="logo__text">
        <span className="logo__name">{settings?.restaurant_name ?? ''}</span>
        <span className="logo__sub">{brandCopy.tagline}</span>
      </span>
    </Link>
  )
}
