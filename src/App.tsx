import { Suspense, lazy, type ReactNode } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Emblem } from './components/Emblem'
import { PublicLayout } from './components/PublicLayout'
import { RestaurantJsonLd } from './components/RestaurantJsonLd'
import { RequireAdmin, RequireAuth } from './components/RouteGuards'
import { ErrorState, PageLoading } from './components/ui/primitives'
import { AuthProvider } from './context/AuthContext'
import { CartProvider } from './context/CartContext'
import { SettingsProvider, useSettings } from './context/SettingsContext'
import { ToastProvider } from './context/ToastContext'
import AccountPage from './pages/Account'
import CartPage from './pages/Cart'
import CheckoutPage from './pages/Checkout'
import Home from './pages/Home'
import LoginPage from './pages/Login'
import MenuPage from './pages/Menu'
import MorePage from './pages/More'
import NotFoundPage from './pages/NotFound'
import OrderTrackingPage from './pages/OrderTracking'
import ReservePage from './pages/Reserve'

// The dashboard is only downloaded by people who open /admin.
const AdminLogin = lazy(() => import('./pages/admin/AdminLogin'))
const AdminApp = lazy(() => import('./pages/admin/AdminApp'))

/** Nothing renders until the restaurant settings are loaded, so every page can rely on them. */
function SettingsGate({ children }: { children: ReactNode }) {
  const { settings, loading, error, reload } = useSettings()

  if (loading) {
    return (
      <div className="splash" role="status" aria-label="Loading">
        <Emblem size={56} />
      </div>
    )
  }
  if (error || !settings) {
    return (
      <div className="container page">
        <ErrorState message={error ?? 'The restaurant details could not be loaded.'} onRetry={() => void reload()} />
      </div>
    )
  }
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <SettingsProvider>
          <AuthProvider>
            <CartProvider>
              <SettingsGate>
                <RestaurantJsonLd />
                <Suspense fallback={<PageLoading />}>
                  <Routes>
                    <Route element={<PublicLayout />}>
                      <Route index element={<Home />} />
                      <Route path="menu" element={<MenuPage />} />
                      <Route path="cart" element={<CartPage />} />
                      <Route path="login" element={<LoginPage />} />
                      <Route path="reserve" element={<ReservePage />} />
                      <Route path="more" element={<MorePage />} />
                      <Route
                        path="checkout"
                        element={
                          <RequireAuth>
                            <CheckoutPage />
                          </RequireAuth>
                        }
                      />
                      <Route
                        path="account"
                        element={
                          <RequireAuth>
                            <AccountPage />
                          </RequireAuth>
                        }
                      />
                      <Route
                        path="order/:id"
                        element={
                          <RequireAuth>
                            <OrderTrackingPage />
                          </RequireAuth>
                        }
                      />
                      <Route path="*" element={<NotFoundPage />} />
                    </Route>

                    <Route path="admin/login" element={<AdminLogin />} />
                    <Route
                      path="admin/*"
                      element={
                        <RequireAdmin>
                          <AdminApp />
                        </RequireAdmin>
                      }
                    />
                  </Routes>
                </Suspense>
              </SettingsGate>
            </CartProvider>
          </AuthProvider>
        </SettingsProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}
