import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { promoImage } from '../lib/images'
import { formatMoney } from '../lib/format'
import { useRequiredSettings } from '../context/SettingsContext'
import { SmartImage } from './ui/SmartImage'

/** Promo copy is driven by settings (deposit, delivery area). No discounts are invented. */
export function PromoBanner() {
  const settings = useRequiredSettings()
  const deposit = settings.reservation_deposit_per_guest
  const line =
    deposit > 0
      ? `Secure your table with a ${formatMoney(deposit, settings.currency)} per guest deposit, paid safely with PayPal.`
      : 'Choose your time online. No deposit required to hold your table.'

  return (
    <section className="promo">
      <SmartImage src={promoImage} alt="The warmly lit dining room" width={900} className="promo__image" />
      <div className="promo__shade" />
      <div className="promo__content">
        <p className="promo__kicker">Dine with us</p>
        <h2 className="promo__title">Reserve your table for tonight</h2>
        <p className="promo__text">{line}</p>
        {settings.delivery_enabled && settings.delivery_area_note && <p className="promo__note">{settings.delivery_area_note}</p>}
        <Link to="/reserve" className="btn btn--gold">
          RESERVE NOW
          <ArrowRight size={17} />
        </Link>
      </div>
    </section>
  )
}
