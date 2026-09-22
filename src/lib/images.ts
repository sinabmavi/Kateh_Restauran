// All photography lives here so it can be swapped in one place.
// Every URL is an Unsplash photo id; `sized()` asks Unsplash for the width actually needed.
import type { CategoryGroup } from './categories'

const unsplash = (id: string, width = 1200) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${width}&q=80`

/** Re-requests an Unsplash image at a specific width. Any other URL (e.g. an uploaded dish photo) is returned unchanged. */
export function sized(url: string, width: number): string {
  if (!url.includes('images.unsplash.com')) return url
  try {
    const parsed = new URL(url)
    parsed.searchParams.set('w', String(width))
    parsed.searchParams.set('q', '80')
    parsed.searchParams.set('auto', 'format')
    parsed.searchParams.set('fit', 'crop')
    return parsed.toString()
  } catch {
    return url
  }
}

export const heroImages = {
  steak: unsplash('1558030006-450675393462', 1800),
  plated: unsplash('1546964124-0cce460f38ef', 1800),
  chef: unsplash('1600565193348-f74bd3c7ccdf', 1800),
  interior: unsplash('1514933651103-005eec06c04b', 1800),
}

export const promoImage = unsplash('1552566626-52f8b828add9', 1600)

export const aboutImages = {
  dining: unsplash('1517248135467-4c7edcad34c4', 1000),
  guests: unsplash('1528605248644-14dd04022da1', 800),
  plating: unsplash('1414235077428-338989a2e8c0', 800),
  chef: unsplash('1600565193348-f74bd3c7ccdf', 800),
}

export const categoryImages: Record<CategoryGroup, string> = {
  starter: unsplash('1512621776951-a57141f2eefd', 800),
  main: unsplash('1529692236671-f1f6cf9683ba', 800),
  steak: unsplash('1546964124-0cce460f38ef', 800),
  seafood: unsplash('1467003909585-2f8a72700288', 800),
  burger: unsplash('1550547660-d9450f859349', 800),
  side: unsplash('1540189549336-e6e99c3679fe', 800),
  dessert: unsplash('1488477181946-6428a0291777', 800),
  drink: unsplash('1514362545857-3bc16c4c7d1b', 800),
  other: unsplash('1414235077428-338989a2e8c0', 800),
}
