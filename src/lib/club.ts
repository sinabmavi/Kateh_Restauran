import { supabase } from './supabase'
import { unwrap } from './errors'
import type { ClubCustomer } from '../../supabase/functions/_shared/marketing.ts'

export type { ClubCustomer } from '../../supabase/functions/_shared/marketing.ts'
export { isReachable } from '../../supabase/functions/_shared/marketing.ts'

/** Everyone registered on the website (staff excluded), with order and reservation stats. */
export async function fetchCustomers(): Promise<ClubCustomer[]> {
  const rows = unwrap<ClubCustomer[]>(await supabase.rpc('admin_customer_directory')) ?? []
  return rows.map((row) => ({ ...row, total_spent: Number(row.total_spent ?? 0) }))
}

export function lastActivityMs(customer: ClubCustomer): number {
  return Math.max(
    ...[customer.last_order_at, customer.last_reservation_at, customer.joined_at].filter((value): value is string => Boolean(value)).map((value) => new Date(value).getTime()),
  )
}

export function customerInitials(customer: Pick<ClubCustomer, 'full_name' | 'email'>): string {
  const source = customer.full_name?.trim() || customer.email || '?'
  return source
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('')
}

/** The error Supabase returns before 09_customer_club.sql has been run. */
export function isSetupMissing(message: string | null | undefined): boolean {
  return /admin_customer_directory|marketing_|schema cache|does not exist/i.test(message ?? '')
}
