import { useEffect, useState } from 'react'
import { UtensilsCrossed } from 'lucide-react'
import { sized } from '../../lib/images'

interface SmartImageProps {
  src: string | null | undefined
  fallbackSrc?: string
  alt: string
  /** Approximate rendered width in CSS pixels; Unsplash images are requested at 2x this. */
  width?: number
  className?: string
  eager?: boolean
}

/** Lazy image with `object-fit: cover`. Falls back to a second source, then to a warm gradient block. */
export function SmartImage({ src, fallbackSrc, alt, width = 600, className = '', eager = false }: SmartImageProps) {
  const sources = [src, fallbackSrc].filter((value): value is string => Boolean(value))
  const [attempt, setAttempt] = useState(0)
  const key = sources.join('|')

  useEffect(() => setAttempt(0), [key])

  const current = sources[attempt]
  if (!current) {
    return (
      <div className={`img-fallback ${className}`} role="img" aria-label={alt}>
        <UtensilsCrossed size={28} aria-hidden />
      </div>
    )
  }

  return (
    <img
      className={`img ${className}`}
      src={sized(current, width * 2)}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => setAttempt((value) => value + 1)}
    />
  )
}
