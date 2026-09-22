import type { FormEvent } from 'react'
import { Search, SlidersHorizontal, X } from 'lucide-react'

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  onSubmit?: () => void
  onFilter?: () => void
  filterActive?: boolean
  placeholder?: string
}

export function SearchBar({ value, onChange, onSubmit, onFilter, filterActive, placeholder = 'Search dishes, drinks, desserts…' }: SearchBarProps) {
  const submit = (event: FormEvent) => {
    event.preventDefault()
    onSubmit?.()
  }

  return (
    <form className="searchbar" role="search" onSubmit={submit}>
      <Search size={20} className="searchbar__icon" aria-hidden />
      <input
        className="searchbar__input"
        type="search"
        inputMode="search"
        enterKeyHint="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label="Search the menu"
      />
      {value && (
        <button type="button" className="searchbar__clear" aria-label="Clear search" onClick={() => onChange('')}>
          <X size={18} />
        </button>
      )}
      {onFilter && (
        <button type="button" className={`searchbar__filter${filterActive ? ' is-active' : ''}`} aria-label="Filter and sort" onClick={onFilter}>
          <SlidersHorizontal size={20} />
        </button>
      )}
    </form>
  )
}
