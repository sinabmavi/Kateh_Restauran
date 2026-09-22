import { useEffect, useState } from 'react'
import { ShoppingBag, X } from 'lucide-react'
import { categoryGroup, dishBadge } from '../lib/categories'
import { categoryImages } from '../lib/images'
import { formatMoney } from '../lib/format'
import type { MenuItem } from '../lib/types'
import { QuantityStepper } from './ui/primitives'
import { Sheet } from './ui/Sheet'
import { SmartImage } from './ui/SmartImage'

interface DishSheetProps {
  item: MenuItem | null
  currency: string
  orderingEnabled: boolean
  onClose: () => void
  onAdd: (item: MenuItem, quantity: number, notes: string) => void
}

/** Item detail bottom sheet: big photo, notes ("medium-rare, no onions"), quantity and add button. */
export function DishSheet({ item, currency, orderingEnabled, onClose, onAdd }: DishSheetProps) {
  const [quantity, setQuantity] = useState(1)
  const [notes, setNotes] = useState('')

  useEffect(() => {
    setQuantity(1)
    setNotes('')
  }, [item?.id])

  if (!item) return null
  const badge = dishBadge(item)

  return (
    <Sheet
      open
      onClose={onClose}
      hideHeader
      flush
      footer={
        orderingEnabled ? (
          <>
            <QuantityStepper value={quantity} min={1} onChange={setQuantity} label="quantity" />
            <button
              type="button"
              className="btn btn--gold btn--lg"
              onClick={() => {
                onAdd(item, quantity, notes)
                onClose()
              }}
            >
              <ShoppingBag size={18} />
              Add · {formatMoney(Number(item.price) * quantity, currency)}
            </button>
          </>
        ) : (
          <p className="dish-sheet__paused">Online ordering is paused right now.</p>
        )
      }
    >
      <div className="dish-sheet__photo">
        <SmartImage src={item.image_url} fallbackSrc={categoryImages[categoryGroup(item.category)]} alt={item.name} width={640} eager />
        {badge && <span className="dish__badge">{badge}</span>}
        <button type="button" className="dish-sheet__close icon-btn" aria-label="Close" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      <div className="dish-sheet__body">
        <p className="dish-sheet__category">{item.category}</p>
        <div className="dish-sheet__title">
          <h2>{item.name}</h2>
          <span className="dish-sheet__price">{formatMoney(item.price, currency)}</span>
        </div>
        {item.description && <p className="dish-sheet__desc">{item.description}</p>}
        {orderingEnabled && (
          <label className="field" htmlFor="dish-notes">
            <span className="field__label">Special requests</span>
            <textarea
              id="dish-notes"
              className="textarea"
              maxLength={200}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="e.g. medium-rare, no onions"
            />
          </label>
        )}
      </div>
    </Sheet>
  )
}
