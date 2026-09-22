import { useEffect } from 'react'
import { useSettings } from '../context/SettingsContext'
import { WEEKDAY_NAMES } from '../lib/format'

const SCRIPT_ID = 'restaurant-jsonld'

/** Injects `Restaurant` structured data built from the live settings and opening hours. */
export function RestaurantJsonLd() {
  const { settings, hours } = useSettings()

  useEffect(() => {
    if (!settings) return
    const data = {
      '@context': 'https://schema.org',
      '@type': 'Restaurant',
      name: settings.restaurant_name,
      url: window.location.origin,
      telephone: settings.restaurant_phone ?? undefined,
      email: settings.restaurant_email ?? undefined,
      address: settings.restaurant_address ?? undefined,
      acceptsReservations: true,
      menu: `${window.location.origin}/menu`,
      openingHoursSpecification: hours
        .filter((row) => row.is_open)
        .map((row) => ({
          '@type': 'OpeningHoursSpecification',
          dayOfWeek: WEEKDAY_NAMES[row.weekday],
          opens: row.start_time.slice(0, 5),
          closes: row.end_time.slice(0, 5),
        })),
    }
    let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null
    if (!script) {
      script = document.createElement('script')
      script.id = SCRIPT_ID
      script.type = 'application/ld+json'
      document.head.appendChild(script)
    }
    script.textContent = JSON.stringify(data)
  }, [settings, hours])

  return null
}
