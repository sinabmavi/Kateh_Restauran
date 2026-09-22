import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { BottomNav } from './BottomNav'
import { Footer } from './Footer'
import { TopBar } from './TopBar'

/** Focused flows hide the bottom navigation so the pay button owns the bottom of the screen. */
const HIDE_BOTTOM_NAV = ['/checkout']

export function PublicLayout() {
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [pathname])

  const showBottomNav = !HIDE_BOTTOM_NAV.includes(pathname)

  return (
    <div className={`app${showBottomNav ? ' app--with-nav' : ''}`}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <TopBar />
      <main id="main" className="app__main">
        <Outlet />
      </main>
      <Footer />
      {showBottomNav && <BottomNav />}
    </div>
  )
}
