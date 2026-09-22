import { getDay } from 'date-fns'
import { restaurantNow } from '../lib/slots'
import { WEEKDAY_NAMES, WEEKDAY_ORDER, formatTimeOfDay } from '../lib/format'
import { useSettings } from '../context/SettingsContext'

export function OpeningHours({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const { hours, settings } = useSettings()
  const today = settings ? getDay(restaurantNow(settings.timezone)) : -1

  return (
    <dl className={`hours hours--${tone}`}>
      {WEEKDAY_ORDER.map((weekday) => {
        const row = hours.find((entry) => entry.weekday === weekday)
        return (
          <div key={weekday} className={`hours__row${weekday === today ? ' is-today' : ''}`}>
            <dt>{WEEKDAY_NAMES[weekday]}</dt>
            <dd>{row?.is_open ? `${formatTimeOfDay(row.start_time)} – ${formatTimeOfDay(row.end_time)}` : 'Closed'}</dd>
          </div>
        )
      })}
    </dl>
  )
}
