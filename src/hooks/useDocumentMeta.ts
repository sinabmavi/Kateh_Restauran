import { useEffect } from 'react'
import { useSettings } from '../context/SettingsContext'

function setMeta(selector: string, attribute: 'name' | 'property', key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(selector)
  if (!element) {
    element = document.createElement('meta')
    element.setAttribute(attribute, key)
    document.head.appendChild(element)
  }
  element.setAttribute('content', content)
}

/** Sets the page title, description and Open Graph tags. The restaurant name always comes from settings. */
export function useDocumentMeta(title: string | null, description?: string) {
  const { settings } = useSettings()
  const name = settings?.restaurant_name ?? ''

  useEffect(() => {
    const full = title ? (name ? `${title} · ${name}` : title) : name || 'Restaurant'
    document.title = full
    const summary =
      description ??
      (name
        ? `${name}: order delivery or pickup online, pay securely with PayPal and reserve a table.`
        : 'Order delivery or pickup online, pay securely with PayPal and reserve a table.')
    setMeta('meta[name="description"]', 'name', 'description', summary)
    setMeta('meta[property="og:title"]', 'property', 'og:title', full)
    setMeta('meta[property="og:description"]', 'property', 'og:description', summary)
    setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', full)
    setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', summary)
  }, [title, description, name])
}
