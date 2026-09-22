import { missingEnv } from '../lib/env'
import { Emblem } from './Emblem'

/** Shown instead of a blank page when the environment variables have not been filled in. */
export function SetupScreen() {
  return (
    <main className="setup">
      <div className="setup__card">
        <span className="setup__emblem">
          <Emblem size={48} />
        </span>
        <h1 className="setup__title">Almost ready</h1>
        <p className="setup__lede">The app needs a few settings before it can start. Add them to <code>.env.local</code> in the project folder, then restart the dev server.</p>

        <div className="setup__block">
          <p className="setup__label">Missing</p>
          <ul>
            {missingEnv.map((name) => (
              <li key={name}>
                <code>{name}</code>
              </li>
            ))}
          </ul>
        </div>

        <pre className="setup__code">{`VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-key
VITE_PAYPAL_CLIENT_ID=your-paypal-client-id`}</pre>

        <ol className="setup__steps">
          <li>
            Supabase: <strong>Project Settings → API</strong> for the URL and the publishable key.
          </li>
          <li>
            PayPal: <strong>developer.paypal.com → Apps &amp; Credentials</strong> for the client id (sandbox while testing).
          </li>
          <li>
            The PayPal <strong>secret</strong> never goes here. It lives only in Supabase Edge Function secrets.
          </li>
        </ol>
      </div>
    </main>
  )
}
