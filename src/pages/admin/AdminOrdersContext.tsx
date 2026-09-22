import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { fetchOrderItems, normaliseOrder } from '../../lib/data'
import { AppError, errorMessage, unwrap } from '../../lib/errors'
import { playNewOrderChime, unlockSound } from '../../lib/sound'
import { supabase } from '../../lib/supabase'
import type { Id, Order, OrderItem, OrderStatus } from '../../lib/types'

interface AdminOrdersState {
  orders: Order[]
  items: Map<Id, OrderItem[]>
  loading: boolean
  error: string | null
  /** Orders in status `placed`: paid and waiting for the restaurant to accept. */
  awaiting: number
  /** Orders that arrived during this session and have not been looked at yet. */
  freshIds: Set<Id>
  soundOn: boolean
  toggleSound: () => Promise<void>
  acknowledge: (id: Id) => void
  reload: () => Promise<void>
  /** Updates an order. When `onlyFrom` is given, the update is skipped (and an error thrown) if the status has moved on. */
  updateOrder: (id: Id, patch: Partial<Order>, onlyFrom?: OrderStatus[]) => Promise<void>
}

const AdminOrdersContext = createContext<AdminOrdersState | null>(null)

const ORDER_LIMIT = 250
const POLL_MS = 20_000
const SOUND_KEY = 'restaurant.admin.sound'

function readSoundPreference(): boolean {
  try {
    return window.localStorage.getItem(SOUND_KEY) === 'on'
  } catch {
    return false
  }
}

export function AdminOrdersProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<Order[]>([])
  const [items, setItems] = useState<Map<Id, OrderItem[]>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [freshIds, setFreshIds] = useState<Set<Id>>(new Set())
  const [soundOn, setSoundOn] = useState(readSoundPreference)
  const knownPlaced = useRef<Set<Id> | null>(null)
  const soundRef = useRef(soundOn)
  soundRef.current = soundOn

  const reload = useCallback(async () => {
    try {
      const rows = unwrap<Order[]>(await supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(ORDER_LIMIT)).map(normaliseOrder)
      const grouped = await fetchOrderItems(rows.map((order) => order.id))
      setOrders(rows)
      setItems(grouped)
      setError(null)

      const placed = new Set(rows.filter((order) => order.status === 'placed').map((order) => order.id))
      if (knownPlaced.current) {
        const arrived = [...placed].filter((id) => !knownPlaced.current!.has(id))
        if (arrived.length > 0) {
          setFreshIds((current) => new Set([...current, ...arrived]))
          if (soundRef.current) playNewOrderChime()
        }
      }
      knownPlaced.current = placed
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
    let debounce = 0
    const channel = supabase
      .channel('admin-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        window.clearTimeout(debounce)
        debounce = window.setTimeout(() => void reload(), 250)
      })
      .subscribe()
    // Fallback in case the socket silently drops.
    const poll = window.setInterval(() => void reload(), POLL_MS)
    return () => {
      window.clearTimeout(debounce)
      window.clearInterval(poll)
      void supabase.removeChannel(channel)
    }
  }, [reload])

  const toggleSound = useCallback(async () => {
    const next = !soundRef.current
    if (next) {
      await unlockSound()
      playNewOrderChime()
    }
    setSoundOn(next)
    try {
      window.localStorage.setItem(SOUND_KEY, next ? 'on' : 'off')
    } catch {
      // The preference simply will not persist.
    }
  }, [])

  const acknowledge = useCallback((id: Id) => {
    setFreshIds((current) => {
      if (!current.has(id)) return current
      const next = new Set(current)
      next.delete(id)
      return next
    })
  }, [])

  const updateOrder = useCallback<AdminOrdersState['updateOrder']>(
    async (id, patch, onlyFrom) => {
      let query = supabase.from('orders').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
      if (onlyFrom) query = query.in('status', onlyFrom)
      const updated = unwrap<Order[]>(await query.select())
      if (updated.length === 0) {
        await reload()
        throw new AppError('This order was already updated elsewhere. The list has been refreshed.')
      }
      const fresh = normaliseOrder(updated[0])
      setOrders((current) => current.map((order) => (order.id === id ? fresh : order)))
      acknowledge(id)
      if (knownPlaced.current && fresh.status !== 'placed') knownPlaced.current.delete(id)
    },
    [acknowledge, reload],
  )

  const awaiting = useMemo(() => orders.filter((order) => order.status === 'placed').length, [orders])

  const value = useMemo<AdminOrdersState>(
    () => ({ orders, items, loading, error, awaiting, freshIds, soundOn, toggleSound, acknowledge, reload, updateOrder }),
    [orders, items, loading, error, awaiting, freshIds, soundOn, toggleSound, acknowledge, reload, updateOrder],
  )

  return <AdminOrdersContext.Provider value={value}>{children}</AdminOrdersContext.Provider>
}

export function useAdminOrders(): AdminOrdersState {
  const value = useContext(AdminOrdersContext)
  if (!value) throw new Error('useAdminOrders must be used inside AdminOrdersProvider')
  return value
}
