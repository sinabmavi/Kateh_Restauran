import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { ChartColumn, Gift, Trophy } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import NotFoundPage from '../NotFound'
import { AdminOrdersProvider } from './AdminOrdersContext'
import AdminLayout from './AdminLayout'
import AdminsPage from './Admins'
import ComingSoonPage from './club/ComingSoon'
import ClubCustomersPage from './club/Customers'
import EmailMarketingPage from './club/email/EmailMarketing'
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
  const { isSuperAdmin } = useAuth()

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
          {isSuperAdmin && <Route path="admins" element={<AdminsPage />} />}
          <Route path="club" element={<Navigate to="customers" replace />} />
          <Route path="club/customers" element={<ClubCustomersPage />} />
          <Route path="club/email" element={<EmailMarketingPage />} />
          <Route
            path="club/loyalty"
            element={<ComingSoonPage title="Loyalty & Rewards" icon={<Gift size={30} />} text="Points, stamp cards and rewards that bring your regulars back again and again." />}
          />
          <Route
            path="club/games"
            element={<ComingSoonPage title="Games & Missions" icon={<Trophy size={30} />} text="Fun challenges and missions that turn every visit into something to look forward to." />}
          />
          <Route
            path="club/analytics"
            element={<ComingSoonPage title="Customer Analytics" icon={<ChartColumn size={30} />} text="Insights into who your customers are, what they love and how often they come back." />}
          />
          <Route path="club/*" element={<Navigate to="customers" replace />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </AdminOrdersProvider>
  )
}
