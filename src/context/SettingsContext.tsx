import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { errorMessage, unwrap } from '../lib/errors'
import type { BusinessHours, RestaurantSettings } from '../lib/types'

interface SettingsState {
  settings: RestaurantSettings | null
  hours: BusinessHours[]
  loading: boolean
  error: string | null
  reload: () => Promise<void>
}

const SettingsContext = createContext<SettingsState | null>(null)

function normalise(row: RestaurantSettings): RestaurantSettings {
  return {
    ...row,
    delivery_fee: Number(row.delivery_fee ?? 0),
    min_order_amount: Number(row.min_order_amount ?? 0),
    reservation_deposit_per_guest: Number(row.reservation_deposit_per_guest ?? 0),
  }
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<RestaurantSettings | null>(null)
  const [hours, setHours] = useState<BusinessHours[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      const [settingsResponse, hoursResponse] = await Promise.all([
        supabase.from('restaurant_settings').select('*').limit(1).maybeSingle(),
        supabase.from('business_hours').select('*').order('weekday', { ascending: true }),
      ])
      const row = unwrap<RestaurantSettings | null>(settingsResponse)
      if (!row) throw new Error('The restaurant settings row is missing. Add one in the Supabase table editor.')
      setSettings(normalise(row))
      setHours(unwrap<BusinessHours[]>(hoursResponse))
      setError(null)
    } catch (failure) {
      setError(errorMessage(failure, 'We could not load the restaurant details.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const value = useMemo(() => ({ settings, hours, loading, error, reload }), [settings, hours, loading, error, reload])
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings(): SettingsState {
  const value = useContext(SettingsContext)
  if (!value) throw new Error('useSettings must be used inside SettingsProvider')
  return value
}

/** For pages that only render after settings have loaded (the app shell guarantees this). */
export function useRequiredSettings(): RestaurantSettings {
  const { settings } = useSettings()
  if (!settings) throw new Error('Settings are not loaded yet')
  return settings
}
