import { useState } from 'react'
import { Plus } from 'lucide-react'
import { categoryGroup, dishBadge } from '../lib/categories'
import { categoryImages } from '../lib/images'
import { formatMoney } from '../lib/format'
import type { MenuItem } from '../lib/types'
import { SmartImage } from './ui/SmartImage'

interface DishCardProps {
  item: MenuItem
  currency: string
  orderingEnabled: boolean
  onOpen: (item: MenuItem) => void
  onQuickAdd: (item: MenuItem) => void
  layout?: 'scroll' | 'grid'
}

export function DishCard({ item, currency, orderingEnabled, onOpen, onQuickAdd, layout = 'scroll' }: DishCardProps) {
  const badge = dishBadge(item)
  const [popped, setPopped] = useState(0)

  return (
    <article className={`dish dish--${layout}`}>
      <button type="button" className="dish__media" onClick={() => onOpen(item)} aria-label={`View ${item.name}`}>
        <SmartImage src={item.image_url} fallbackSrc={categoryImages[categoryGroup(item.category)]} alt={item.name} width={320} />
        {badge && <span className="dish__badge">{badge}</span>}
      </button>
      <div className="dish__body">
        <button type="button" className="dish__name" onClick={() => onOpen(item)}>
          {item.name}
        </button>
        {item.description && <p className="dish__desc">{item.description}</p>}
        <div className="dish__foot">
          <span className="dish__price">{formatMoney(item.price, currency)}</span>
          <button
            type="button"
            key={popped}
            className={`dish__add${popped ? ' is-popped' : ''}`}
            aria-label={`Add ${item.name} to cart`}
            disabled={!orderingEnabled}
            onClick={() => {
              onQuickAdd(item)
              setPopped((value) => value + 1)
            }}
          >
            <Plus size={20} strokeWidth={2.6} />
          </button>
        </div>
      </div>
    </article>
  )
}

export function DishCardSkeleton({ layout = 'scroll' }: { layout?: 'scroll' | 'grid' }) {
  return (
    <div className={`dish dish--${layout} dish--skeleton`} aria-hidden>
      <div className="dish__media skeleton" />
      <div className="dish__body">
        <div className="skeleton" style={{ height: 18, width: '70%' }} />
        <div className="skeleton" style={{ height: 12, width: '95%' }} />
        <div className="skeleton" style={{ height: 12, width: '60%' }} />
      </div>
    </div>
  )
}
