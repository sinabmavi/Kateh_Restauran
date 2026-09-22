import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/tokens.css'
import './styles/base.css'
import './styles/public.css'
import './styles/admin.css'
import { missingEnv } from './lib/env'
import { SetupScreen } from './components/SetupScreen'

const root = createRoot(document.getElementById('root')!)

if (missingEnv.length > 0) {
  // Nothing that touches Supabase is imported in this branch, so a missing key shows a setup screen, not a blank page.
  root.render(
    <StrictMode>
      <SetupScreen />
    </StrictMode>,
  )
} else {
  void import('./App').then(({ default: App }) =>
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    ),
  )
}
