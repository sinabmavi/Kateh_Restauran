import { useEffect } from 'react'
import { Route, Routes } from 'react-router-dom'
import NotFoundPage from '../NotFound'
import { AdminOrdersProvider } from './AdminOrdersContext'
import AdminLayout from './AdminLayout'
import BlockedDatesPage from './BlockedDates'
import BusinessHoursPage from './BusinessHours'
import MenuItemsPage from './MenuItems'
import OrdersPage from './Orders'
import OverviewPage from './Overview'
import PaymentsPage from './Payments'
import ReservationsPage from './Reservations'
import SettingsPage from './Settings'
import TablesPage from './Tables'

/** Everything under /admin. The dashboard uses Inter only; the flag below swaps the serif font for it. */
export default function AdminApp() {
  useEffect(() => {
    document.body.classList.add('is-admin')
    return () => document.body.classList.remove('is-admin')
  }, [])

  return (
    <AdminOrdersProvider>
      <Routes>
        <Route element={<AdminLayout />}>
          <Route index element={<OverviewPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="payments" element={<PaymentsPage />} />
          <Route path="reservations" element={<ReservationsPage />} />
          <Route path="tables" element={<TablesPage />} />
          <Route path="menu" element={<MenuItemsPage />} />
          <Route path="hours" element={<BusinessHoursPage />} />
          <Route path="blocked-dates" element={<BlockedDatesPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </AdminOrdersProvider>
  )
}
