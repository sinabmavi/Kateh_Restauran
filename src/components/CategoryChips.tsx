import { Beef, CakeSlice, ChefHat, Fish, LayoutGrid, Salad, Sandwich, Soup, Utensils, Wine, type LucideIcon } from 'lucide-react'
import { categoryGroup, type CategoryChip, type CategoryGroup } from '../lib/categories'

const ICONS: Record<CategoryGroup, LucideIcon> = {
  starter: Soup,
  main: ChefHat,
  steak: Beef,
  seafood: Fish,
  burger: Sandwich,
  side: Salad,
  dessert: CakeSlice,
  drink: Wine,
  other: Utensils,
}

export function CategoryIcon({ category, size = 26 }: { category: string; size?: number }) {
  const Icon = ICONS[categoryGroup(category)]
  return <Icon size={size} strokeWidth={1.7} aria-hidden />
}

interface CategoryChipsProps {
  categories: CategoryChip[]
  selected: string | null
  onSelect: (category: string | null) => void
}

export function CategoryChips({ categories, selected, onSelect }: CategoryChipsProps) {
  return (
    <div className="cats hscroll" role="group" aria-label="Menu categories">
      <button type="button" className={`cat${selected === null ? ' is-active' : ''}`} aria-pressed={selected === null} onClick={() => onSelect(null)}>
        <span className="cat__circle">
          <LayoutGrid size={26} strokeWidth={1.7} aria-hidden />
        </span>
        <span className="cat__label">All</span>
      </button>
      {categories.map((category) => (
        <button
          key={category.name}
          type="button"
          className={`cat${selected === category.name ? ' is-active' : ''}`}
          aria-pressed={selected === category.name}
          onClick={() => onSelect(selected === category.name ? null : category.name)}
        >
          <span className="cat__circle">
            <CategoryIcon category={category.name} />
          </span>
          <span className="cat__label">{category.name}</span>
        </button>
      ))}
    </div>
  )
}
