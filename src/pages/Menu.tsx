import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SearchX } from 'lucide-react'
import { CategoryChips } from '../components/CategoryChips'
import { DishCard, DishCardSkeleton } from '../components/DishCard'
import { DishSheet } from '../components/DishSheet'
import { SearchBar } from '../components/SearchBar'
import { StickyCartBar } from '../components/StickyCartBar'
import { EmptyState, ErrorState } from '../components/ui/primitives'
import { Sheet } from '../components/ui/Sheet'
import { useRequiredSettings } from '../context/SettingsContext'
import { useAddToCart } from '../hooks/useAddToCart'
import { useDocumentMeta } from '../hooks/useDocumentMeta'
import { useMenuItems } from '../hooks/useMenuItems'
import { buildCategories } from '../lib/categories'
import type { MenuItem } from '../lib/types'

type Sort = 'featured' | 'price-asc' | 'price-desc' | 'name'

const SORTS: Array<{ value: Sort; label: string }> = [
  { value: 'featured', label: 'Featured first' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
  { value: 'name', label: 'Name: A to Z' },
]

function sortItems(items: MenuItem[], sort: Sort): MenuItem[] {
  const list = [...items]
  switch (sort) {
    case 'price-asc':
      return list.sort((a, b) => a.price - b.price)
    case 'price-desc':
      return list.sort((a, b) => b.price - a.price)
    case 'name':
      return list.sort((a, b) => a.name.localeCompare(b.name))
    default:
      return list.sort((a, b) => Number(b.is_featured) - Number(a.is_featured) || a.name.localeCompare(b.name))
  }
}

export default function Menu() {
  const settings = useRequiredSettings()
  const menu = useMenuItems()
  const { addItem, orderingEnabled } = useAddToCart()
  const [params, setParams] = useSearchParams()
  const [selected, setSelected] = useState<MenuItem | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [sort, setSort] = useState<Sort>('featured')
  const [featuredOnly, setFeaturedOnly] = useState(false)
  useDocumentMeta('Menu', `Browse the full menu and order for delivery or pickup.`)

  const category = params.get('category')
  const query = params.get('q') ?? ''

  const updateParam = (key: 'category' | 'q', value: string | null) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const items = menu.data ?? []
  const categories = useMemo(() => buildCategories(items), [items])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const filtered = items.filter((item) => {
      if (category && item.category !== category) return false
      if (featuredOnly && !item.is_featured) return false
      if (!needle) return true
      return [item.name, item.description ?? '', item.category].some((text) => text.toLowerCase().includes(needle))
    })
    return sortItems(filtered, sort)
  }, [items, category, query, featuredOnly, sort])

  // Grouped by category when nothing is filtered, a flat grid otherwise.
  const grouped = !category && !query.trim() && !featuredOnly
  const groups = useMemo(() => {
    if (!grouped) return []
    return categories
      .map((chip) => ({ name: chip.name, items: visible.filter((item) => item.category === chip.name) }))
      .filter((group) => group.items.length > 0)
  }, [grouped, categories, visible])

  const renderCard = (item: MenuItem) => (
    <DishCard key={item.id} item={item} layout="grid" currency={settings.currency} orderingEnabled={orderingEnabled} onOpen={setSelected} onQuickAdd={(dish) => addItem(dish)} />
  )

  return (
    <div className="container page menu-page">
      <header className="page__head">
        <div>
          <h1 className="page__title">Our menu</h1>
          <p className="page__lede">Everything is cooked to order. Add to your basket and choose delivery or pickup at checkout.</p>
        </div>
      </header>

      {!settings.ordering_enabled && (
        <div className="notice notice--info menu-page__paused" role="status">
          Online ordering is paused right now. You can still browse the menu.
        </div>
      )}

      <div className="menu-page__tools">
        <SearchBar value={query} onChange={(value) => updateParam('q', value || null)} onFilter={() => setFiltersOpen(true)} filterActive={sort !== 'featured' || featuredOnly} />
        {categories.length > 0 && <CategoryChips categories={categories} selected={category} onSelect={(value) => updateParam('category', value)} />}
      </div>

      {menu.error ? (
        <ErrorState message={menu.error} onRetry={menu.reload} />
      ) : menu.loading && !menu.data ? (
        <div className="dish-grid">
          {Array.from({ length: 6 }, (_, index) => (
            <DishCardSkeleton key={index} layout="grid" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<SearchX size={28} />}
          title="Nothing matches"
          text="Try a different search or clear the filters to see the whole menu."
          action={
            <button
              type="button"
              className="btn btn--dark"
              onClick={() => {
                setParams({}, { replace: true })
                setFeaturedOnly(false)
                setSort('featured')
              }}
            >
              Clear filters
            </button>
          }
        />
      ) : grouped ? (
        groups.map((group) => (
          <section key={group.name} className="menu-group" aria-labelledby={`group-${group.name}`}>
            <h2 className="menu-group__title" id={`group-${group.name}`}>
              {group.name}
            </h2>
            <div className="dish-grid">{group.items.map(renderCard)}</div>
          </section>
        ))
      ) : (
        <div className="dish-grid">{visible.map(renderCard)}</div>
      )}

      <StickyCartBar />

      <DishSheet item={selected} currency={settings.currency} orderingEnabled={orderingEnabled} onClose={() => setSelected(null)} onAdd={(item, quantity, notes) => addItem(item, quantity, notes)} />

      <Sheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filter and sort"
        footer={
          <>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                setSort('featured')
                setFeaturedOnly(false)
              }}
            >
              Reset
            </button>
            <button type="button" className="btn btn--gold" onClick={() => setFiltersOpen(false)}>
              Show {visible.length} {visible.length === 1 ? 'dish' : 'dishes'}
            </button>
          </>
        }
      >
        <div className="filter-group">
          <h3 className="filter-group__title">Sort by</h3>
          <div className="filter-group__chips">
            {SORTS.map((option) => (
              <button key={option.value} type="button" className="chip" aria-pressed={sort === option.value} onClick={() => setSort(option.value)}>
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="filter-group">
          <h3 className="filter-group__title">Show</h3>
          <div className="filter-group__chips">
            <button type="button" className="chip" aria-pressed={featuredOnly} onClick={() => setFeaturedOnly((value) => !value)}>
              Featured dishes only
            </button>
          </div>
        </div>
      </Sheet>
    </div>
  )
}
