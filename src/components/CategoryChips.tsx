import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import { Beef, CakeSlice, ChefHat, ChevronLeft, ChevronRight, Fish, LayoutGrid, Salad, Sandwich, Soup, Utensils, Wine, type LucideIcon } from 'lucide-react'
import { categoryGroup, type CategoryChip, type CategoryGroup } from '../lib/categories'

const DRAG_THRESHOLD = 5

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
  const scroller = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ left: false, right: false })
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null)
  const swallowClick = useRef(false)

  const updateEdges = useCallback(() => {
    const element = scroller.current
    if (!element) return
    const max = element.scrollWidth - element.clientWidth
    setEdges({ left: element.scrollLeft > 2, right: element.scrollLeft < max - 2 })
  }, [])

  useEffect(() => {
    const element = scroller.current
    if (!element) return
    updateEdges()
    const observer = new ResizeObserver(updateEdges)
    observer.observe(element)
    return () => observer.disconnect()
  }, [updateEdges, categories.length])

  const scrollByPage = (direction: 1 | -1) => {
    const element = scroller.current
    if (element) element.scrollBy({ left: direction * element.clientWidth * 0.8, behavior: 'smooth' })
  }

  // Click-and-drag scrolling for mouse users; touch and trackpads keep their native scrolling.
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    swallowClick.current = false
    if (event.pointerType !== 'mouse' || event.button !== 0 || !scroller.current) return
    drag.current = { x: event.clientX, left: scroller.current.scrollLeft, moved: false }
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const state = drag.current
    const element = scroller.current
    if (!state || !element) return
    const distance = event.clientX - state.x
    if (!state.moved) {
      if (Math.abs(distance) < DRAG_THRESHOLD) return
      state.moved = true
      element.setPointerCapture(event.pointerId)
      setDragging(true)
    }
    element.scrollLeft = state.left - distance
  }

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.moved) {
      swallowClick.current = true
      if (scroller.current?.hasPointerCapture(event.pointerId)) scroller.current.releasePointerCapture(event.pointerId)
    }
    drag.current = null
    setDragging(false)
  }

  return (
    <div className={`cats-wrap${edges.left ? ' can-left' : ''}${edges.right ? ' can-right' : ''}`}>
      {edges.left && (
        <button type="button" className="cats__arrow cats__arrow--left" aria-label="Scroll categories left" onClick={() => scrollByPage(-1)}>
          <ChevronLeft size={18} strokeWidth={2.2} />
        </button>
      )}
      {edges.right && (
        <button type="button" className="cats__arrow cats__arrow--right" aria-label="Scroll categories right" onClick={() => scrollByPage(1)}>
          <ChevronRight size={18} strokeWidth={2.2} />
        </button>
      )}
      <div
        ref={scroller}
        className={`cats hscroll${dragging ? ' is-dragging' : ''}`}
        role="group"
        aria-label="Menu categories"
        onScroll={updateEdges}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDragStart={(event) => event.preventDefault()}
        onClickCapture={(event) => {
          if (!swallowClick.current) return
          swallowClick.current = false
          event.preventDefault()
          event.stopPropagation()
        }}
      >
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
    </div>
  )
}
