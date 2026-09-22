import type { MenuItem } from './types'

export type CategoryGroup = 'starter' | 'main' | 'steak' | 'seafood' | 'burger' | 'side' | 'dessert' | 'drink' | 'other'

// Category names are free text in the database, so they are matched by keyword to pick an icon and photo.
const MATCHERS: Array<[CategoryGroup, RegExp]> = [
  ['steak', /steak|grill|\bbeef\b|\bbbq\b|\bribs?\b/i],
  ['seafood', /seafood|\bfish\b|shellfish|oyster|lobster|prawn|shrimp/i],
  ['burger', /burger|sandwich/i],
  ['starter', /starter|appeti[sz]er|\bsmall plates?\b|\bsoups?\b|\bsalads?\b/i],
  ['side', /\bsides?\b/i],
  ['dessert', /dessert|\bsweets?\b|\bcakes?\b|pastr|ice cream/i],
  ['drink', /drink|beverage|\bwines?\b|cocktail|\bbeers?\b|coffee|\btea\b|juice|soda/i],
  ['main', /\bmains?\b|entr[eé]e|dinner|lunch/i],
]

/** Sensible dining order; anything not listed follows alphabetically. */
const DINING_ORDER: CategoryGroup[] = ['starter', 'main', 'steak', 'seafood', 'burger', 'side', 'dessert', 'drink']

export function categoryGroup(category: string): CategoryGroup {
  for (const [group, pattern] of MATCHERS) if (pattern.test(category)) return group
  return 'other'
}

export interface CategoryChip {
  name: string
  group: CategoryGroup
  count: number
}

/** Builds the chip list from whatever categories exist on the active menu items. */
export function buildCategories(items: MenuItem[]): CategoryChip[] {
  const counts = new Map<string, number>()
  for (const item of items) {
    const name = item.category.trim()
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count, group: categoryGroup(name) }))
    .sort((a, b) => {
      const rankA = DINING_ORDER.indexOf(a.group)
      const rankB = DINING_ORDER.indexOf(b.group)
      if (rankA !== -1 && rankB !== -1 && rankA !== rankB) return rankA - rankB
      if (rankA !== -1 && rankB === -1) return -1
      if (rankA === -1 && rankB !== -1) return 1
      return a.name.localeCompare(b.name)
    })
}

/** Badge derived from `is_featured` and the category; nothing is invented. */
export function dishBadge(item: MenuItem): string | null {
  if (!item.is_featured) return null
  const group = categoryGroup(item.category)
  if (group === 'main' || group === 'steak' || group === 'seafood') return "CHEF'S PICK"
  if (group === 'starter' || group === 'dessert') return 'POPULAR'
  return 'BESTSELLER'
}

export function isOrderable(item: MenuItem): boolean {
  return item.is_active && Number(item.price) > 0
}
