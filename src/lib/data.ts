import { supabase } from './supabase'
import { unwrap } from './errors'
import type { BlockedDate, BusySlot, Id, MenuItem, Order, OrderItem, RestaurantTable } from './types'

export async function fetchActiveMenuItems(): Promise<MenuItem[]> {
  const items = unwrap<MenuItem[]>(
    await supabase.from('menu_items').select('*').eq('is_active', true).order('name', { ascending: true }),
  )
  return items.map((item) => ({ ...item, price: Number(item.price) }))
}

export async function fetchActiveTables(): Promise<RestaurantTable[]> {
  return unwrap<RestaurantTable[]>(await supabase.from('restaurant_tables').select('*').eq('is_active', true))
}

export async function fetchBlockedDates(): Promise<BlockedDate[]> {
  return unwrap<BlockedDate[]>(await supabase.from('blocked_dates').select('*').order('blocked_date', { ascending: true }))
}

/** Public availability: only table id and times, never guest details. */
export async function fetchBusySlots(date: string): Promise<BusySlot[]> {
  return unwrap<BusySlot[]>(await supabase.rpc('get_busy_slots', { p_date: date })) ?? []
}

export async function fetchOrderItems(orderIds: Id[]): Promise<Map<Id, OrderItem[]>> {
  const grouped = new Map<Id, OrderItem[]>()
  if (orderIds.length === 0) return grouped
  const rows = unwrap<OrderItem[]>(await supabase.from('order_items').select('*').in('order_id', orderIds).order('id'))
  for (const row of rows) {
    const list = grouped.get(row.order_id) ?? []
    list.push({ ...row, unit_price: Number(row.unit_price), line_total: Number(row.line_total) })
    grouped.set(row.order_id, list)
  }
  return grouped
}

export function normaliseOrder(order: Order): Order {
  return {
    ...order,
    subtotal: Number(order.subtotal),
    delivery_fee: Number(order.delivery_fee),
    total: Number(order.total),
  }
}
