import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { isOrderable } from '../lib/categories'
import { toCents } from '../../supabase/functions/_shared/rules'
import type { Id, MenuItem, OrderType } from '../lib/types'

export interface CartLine {
  lineId: string
  menuItemId: Id
  name: string
  price: number
  imageUrl: string | null
  category: string
  quantity: number
  notes: string
}

interface CartStored {
  lines: CartLine[]
  orderType: OrderType
}

interface ReconcileResult {
  removed: string[]
  repriced: string[]
}

interface CartState {
  lines: CartLine[]
  count: number
  /** Client-side estimate only; the server always recomputes prices from the database. */
  subtotal: number
  orderType: OrderType
  /** Increments on every add so UI can play a small "pop" animation. */
  addedTick: number
  setOrderType: (type: OrderType) => void
  add: (item: MenuItem, quantity?: number, notes?: string) => void
  setQuantity: (lineId: string, quantity: number) => void
  setNotes: (lineId: string, notes: string) => void
  remove: (lineId: string) => void
  clear: () => void
  replaceLines: (lines: Array<{ item: MenuItem; quantity: number; notes: string }>) => void
  reconcile: (menu: MenuItem[]) => ReconcileResult
}

const STORAGE_KEY = 'restaurant.cart.v1'
const MAX_QUANTITY = 50

const CartContext = createContext<CartState | null>(null)

const lineIdFor = (menuItemId: Id, notes: string) => `${menuItemId}::${notes.trim().toLowerCase()}`

function readStored(): CartStored {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CartStored>
      if (Array.isArray(parsed.lines)) {
        return {
          lines: parsed.lines.filter((line) => line && line.menuItemId && line.quantity > 0),
          orderType: parsed.orderType === 'pickup' ? 'pickup' : 'delivery',
        }
      }
    }
  } catch {
    // Storage can be unavailable (private mode); the cart simply starts empty.
  }
  return { lines: [], orderType: 'delivery' }
}

function lineFrom(item: MenuItem, quantity: number, notes: string): CartLine {
  return {
    lineId: lineIdFor(item.id, notes),
    menuItemId: item.id,
    name: item.name,
    price: Number(item.price),
    imageUrl: item.image_url,
    category: item.category,
    quantity: Math.min(MAX_QUANTITY, quantity),
    notes: notes.trim(),
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState<CartStored>(readStored)
  const [addedTick, setAddedTick] = useState(0)
  const storedRef = useRef(stored)
  storedRef.current = stored

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
    } catch {
      // Ignore: the cart still works for this session.
    }
  }, [stored])

  const updateLines = useCallback((update: (lines: CartLine[]) => CartLine[]) => {
    setStored((current) => ({ ...current, lines: update(current.lines) }))
  }, [])

  const add = useCallback<CartState['add']>(
    (item, quantity = 1, notes = '') => {
      const incoming = lineFrom(item, quantity, notes)
      updateLines((lines) => {
        const existing = lines.find((line) => line.lineId === incoming.lineId)
        if (!existing) return [...lines, incoming]
        return lines.map((line) =>
          line.lineId === incoming.lineId
            ? { ...line, price: incoming.price, quantity: Math.min(MAX_QUANTITY, line.quantity + incoming.quantity) }
            : line,
        )
      })
      setAddedTick((tick) => tick + 1)
    },
    [updateLines],
  )

  const setQuantity = useCallback(
    (lineId: string, quantity: number) => {
      updateLines((lines) =>
        quantity <= 0
          ? lines.filter((line) => line.lineId !== lineId)
          : lines.map((line) => (line.lineId === lineId ? { ...line, quantity: Math.min(MAX_QUANTITY, quantity) } : line)),
      )
    },
    [updateLines],
  )

  const setNotes = useCallback(
    (lineId: string, notes: string) => {
      updateLines((lines) => lines.map((line) => (line.lineId === lineId ? { ...line, notes } : line)))
    },
    [updateLines],
  )

  const remove = useCallback((lineId: string) => updateLines((lines) => lines.filter((line) => line.lineId !== lineId)), [updateLines])
  const clear = useCallback(() => updateLines(() => []), [updateLines])

  const replaceLines = useCallback<CartState['replaceLines']>(
    (entries) => {
      const merged = new Map<string, CartLine>()
      for (const { item, quantity, notes } of entries) {
        const line = lineFrom(item, quantity, notes)
        const existing = merged.get(line.lineId)
        merged.set(line.lineId, existing ? { ...existing, quantity: Math.min(MAX_QUANTITY, existing.quantity + line.quantity) } : line)
      }
      updateLines(() => [...merged.values()])
    },
    [updateLines],
  )

  const setOrderType = useCallback((orderType: OrderType) => setStored((current) => ({ ...current, orderType })), [])

  const reconcile = useCallback<CartState['reconcile']>(
    (menu) => {
      const byId = new Map(menu.map((item) => [item.id, item]))
      const removed: string[] = []
      const repriced: string[] = []
      const next: CartLine[] = []
      for (const line of storedRef.current.lines) {
        const item = byId.get(line.menuItemId)
        if (!item || !isOrderable(item)) {
          removed.push(line.name)
          continue
        }
        const price = Number(item.price)
        if (toCents(price) !== toCents(line.price)) repriced.push(item.name)
        next.push({ ...line, name: item.name, price, imageUrl: item.image_url, category: item.category })
      }
      if (removed.length || repriced.length || next.some((line, index) => line.name !== storedRef.current.lines[index]?.name)) {
        updateLines(() => next)
      }
      return { removed, repriced }
    },
    [updateLines],
  )

  const value = useMemo<CartState>(() => {
    const count = stored.lines.reduce((sum, line) => sum + line.quantity, 0)
    const subtotalCents = stored.lines.reduce((sum, line) => sum + toCents(line.price) * line.quantity, 0)
    return {
      lines: stored.lines,
      count,
      subtotal: subtotalCents / 100,
      orderType: stored.orderType,
      addedTick,
      setOrderType,
      add,
      setQuantity,
      setNotes,
      remove,
      clear,
      replaceLines,
      reconcile,
    }
  }, [stored, addedTick, setOrderType, add, setQuantity, setNotes, remove, clear, replaceLines, reconcile])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart(): CartState {
  const value = useContext(CartContext)
  if (!value) throw new Error('useCart must be used inside CartProvider')
  return value
}
