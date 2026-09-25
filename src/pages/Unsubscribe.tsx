import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { MailCheck, MailX } from 'lucide-react'
import { PageLoading } from '../components/ui/primitives'
import { useRequiredSettings } from '../context/SettingsContext'
import { useDocumentMeta } from '../hooks/useDocumentMeta'
import { setEmailSubscription } from '../lib/api'
import { errorMessage } from '../lib/errors'

/** Landing page for the unsubscribe link in Customer Club emails. */
export default function UnsubscribePage() {
  const settings = useRequiredSettings()
  const [params] = useSearchParams()
  const userId = params.get('u') ?? ''
  const token = params.get('t') ?? ''
  const [state, setState] = useState<'working' | 'unsubscribed' | 'subscribed' | 'error'>('working')
  const [error, setError] = useState('')
  useDocumentMeta('Email preferences')

  const update = async (subscribed: boolean) => {
    setState('working')
    try {
      await setEmailSubscription(userId, token, subscribed)
      setState(subscribed ? 'subscribed' : 'unsubscribed')
    } catch (failure) {
      setError(errorMessage(failure))
      setState('error')
    }
  }

  useEffect(() => {
    if (!userId || !token) {
      setError('This link is incomplete. Please use the link from the email.')
      setState('error')
      return
    }
    void update(false)
  }, [])

  if (state === 'working') return <PageLoading />

  return (
    <div className="container page">
      <div className="result card card--pad">
        <span className="result__icon">{state === 'subscribed' ? <MailCheck size={34} /> : <MailX size={34} />}</span>
        <h1 className="result__title">{state === 'unsubscribed' ? 'You have been unsubscribed' : state === 'subscribed' ? 'Welcome back!' : 'Something went wrong'}</h1>
        <p className="result__text">
          {state === 'unsubscribed'
            ? `You will no longer receive offers and news from ${settings.restaurant_name}. You will still get emails about your own orders and reservations.`
            : state === 'subscribed'
              ? `You are subscribed again and will hear about offers and news from ${settings.restaurant_name}.`
              : error}
        </p>
        <div className="result__actions">
          {state === 'unsubscribed' && (
            <button type="button" className="btn btn--ghost" onClick={() => void update(true)}>
              Changed your mind? Resubscribe
            </button>
          )}
          <Link to="/" className="btn btn--gold">
            Back to the website
          </Link>
        </div>
      </div>
    </div>
  )
}
