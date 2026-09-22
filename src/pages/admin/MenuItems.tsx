import { useMemo, useState, type FormEvent } from 'react'
import { Pencil, Plus, Search, Star, TriangleAlert, UtensilsCrossed } from 'lucide-react'
import { AdminPageHead } from '../../components/admin'
import { EmptyState, ErrorState, Field, Skeleton, Switch } from '../../components/ui/primitives'
import { Sheet } from '../../components/ui/Sheet'
import { SmartImage } from '../../components/ui/SmartImage'
import { useRequiredSettings } from '../../context/SettingsContext'
import { useToast } from '../../context/ToastContext'
import { useAsync } from '../../hooks/useAsync'
import { buildCategories, categoryGroup } from '../../lib/categories'
import { errorMessage, unwrap } from '../../lib/errors'
import { formatMoney } from '../../lib/format'
import { categoryImages } from '../../lib/images'
import { supabase } from '../../lib/supabase'
import type { MenuItem } from '../../lib/types'

interface Draft {
  id?: string
  name: string
  description: string
  price: string
  category: string
  image_url: string
  is_featured: boolean
  is_active: boolean
}

const EMPTY: Draft = { name: '', description: '', price: '', category: '', image_url: '', is_featured: false, is_active: true }

export default function MenuItemsPage() {
  const settings = useRequiredSettings()
  const toast = useToast()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const state = useAsync(async () => unwrap<MenuItem[]>(await supabase.from('menu_items').select('*').order('category', { ascending: true }).order('name', { ascending: true })).map((item) => ({ ...item, price: Number(item.price) })), [])

  const items = state.data ?? []
  const categories = useMemo(() => buildCategories(items), [items])

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return items.filter((item) => (!category || item.category === category) && (!needle || `${item.name} ${item.description ?? ''} ${item.category}`.toLowerCase().includes(needle)))
  }, [items, search, category])

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!draft) return
    const price = Number(draft.price)
    if (draft.name.trim().length === 0) return toast.error('Please enter a name for the dish.')
    if (draft.price.trim() === '' || !Number.isFinite(price) || price < 0) return toast.error('Please enter a valid price (0 or more).')
    if (draft.image_url.trim() && !/^https?:\/\//i.test(draft.image_url.trim())) return toast.error('The image link must start with http:// or https://')

    setBusy(true)
    try {
      const values = {
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        price,
        category: draft.category.trim() || 'Other',
        image_url: draft.image_url.trim() || null,
        is_featured: draft.is_featured,
        is_active: draft.is_active,
      }
      unwrap(draft.id ? await supabase.from('menu_items').update(values).eq('id', draft.id) : await supabase.from('menu_items').insert(values))
      toast.success(draft.id ? 'Dish updated' : 'Dish added')
      setDraft(null)
      state.reload()
    } catch (failure) {
      toast.error(errorMessage(failure))
    } finally {
      setBusy(false)
    }
  }

  const toggle = async (item: MenuItem, field: 'is_active' | 'is_featured') => {
    try {
      unwrap(await supabase.from('menu_items').update({ [field]: !item[field] }).eq('id', item.id))
      state.reload()
    } catch (failure) {
      toast.error(errorMessage(failure))
    }
  }

  const previewCategory = draft ? draft.category || 'Other' : 'Other'

  return (
    <>
      <AdminPageHead
        title="Menu Items"
        subtitle="Inactive dishes stay here but never appear on the site. A dish needs a price above zero to be orderable."
        actions={
          <button type="button" className="btn btn--gold" onClick={() => setDraft({ ...EMPTY })}>
            <Plus size={17} /> Add dish
          </button>
        }
      />

      <div className="toolbar">
        <label className="toolbar__search">
          <Search size={17} />
          <input type="search" className="toolbar__input" placeholder="Search dishes" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search dishes" />
        </label>
        <select className="select select--sm toolbar__select" value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filter by category">
          <option value="">All categories</option>
          {categories.map((entry) => (
            <option key={entry.name} value={entry.name}>
              {entry.name}
            </option>
          ))}
        </select>
      </div>

      {state.error ? (
        <ErrorState message={state.error} onRetry={state.reload} />
      ) : !state.data ? (
        <Skeleton style={{ height: 300, borderRadius: 22 }} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<UtensilsCrossed size={28} />}
          title={items.length === 0 ? 'The menu is empty' : 'No dishes match'}
          text={items.length === 0 ? 'Add your first dish and it will appear on the site.' : 'Try a different search.'}
          action={
            items.length === 0 ? (
              <button type="button" className="btn btn--gold" onClick={() => setDraft({ ...EMPTY })}>
                Add dish
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="table-wrap card">
          <table className="dt">
            <thead>
              <tr>
                <th>Dish</th>
                <th>Category</th>
                <th className="num">Price</th>
                <th>Featured</th>
                <th>Active</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => (
                <tr key={item.id} className={item.is_active ? undefined : 'is-muted'}>
                  <td data-label="Dish">
                    <span className="dish-cell">
                      <span className="dish-cell__thumb">
                        <SmartImage src={item.image_url} fallbackSrc={categoryImages[categoryGroup(item.category)]} alt="" width={64} />
                      </span>
                      <span className="dt__stack">
                        <strong>{item.name}</strong>
                        {item.description && <small className="dt__clamp">{item.description}</small>}
                      </span>
                    </span>
                  </td>
                  <td data-label="Category">
                    <span className="badge">{item.category}</span>
                  </td>
                  <td data-label="Price" className="num">
                    <strong>{formatMoney(item.price, settings.currency)}</strong>
                    {item.price <= 0 && (
                      <small className="dt__warn">
                        <TriangleAlert size={12} /> Not orderable
                      </small>
                    )}
                  </td>
                  <td data-label="Featured">
                    <span className="dt__inline">
                      <Switch checked={item.is_featured} onChange={() => void toggle(item, 'is_featured')} label={`${item.name} featured`} />
                      {item.is_featured && <Star size={14} className="dt__star" />}
                    </span>
                  </td>
                  <td data-label="Active">
                    <Switch checked={item.is_active} onChange={() => void toggle(item, 'is_active')} label={`${item.name} active`} />
                  </td>
                  <td data-label="">
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() =>
                        setDraft({
                          id: item.id,
                          name: item.name,
                          description: item.description ?? '',
                          price: String(item.price),
                          category: item.category,
                          image_url: item.image_url ?? '',
                          is_featured: item.is_featured,
                          is_active: item.is_active,
                        })
                      }
                    >
                      <Pencil size={14} /> Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Sheet
        open={Boolean(draft)}
        onClose={() => setDraft(null)}
        placement="right"
        title={draft?.id ? 'Edit dish' : 'Add dish'}
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setDraft(null)}>
              Cancel
            </button>
            <button type="submit" form="dish-form" className="btn btn--gold" disabled={busy}>
              {busy ? 'Saving…' : 'Save dish'}
            </button>
          </>
        }
      >
        {draft && (
          <form id="dish-form" className="form-grid" onSubmit={save}>
            <div className="image-preview">
              <SmartImage src={draft.image_url.trim() || null} fallbackSrc={categoryImages[categoryGroup(previewCategory)]} alt="Photo preview" width={400} />
              <span className="image-preview__tag">{draft.image_url.trim() ? 'Live preview' : 'Category photo is used until you add one'}</span>
            </div>
            <Field label="Name" htmlFor="mi-name">
              <input id="mi-name" className="input" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} data-autofocus />
            </Field>
            <Field label="Description" htmlFor="mi-desc">
              <textarea id="mi-desc" className="textarea" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
            </Field>
            <div className="form-grid form-grid--2">
              <Field label={`Price (${settings.currency})`} htmlFor="mi-price">
                <input id="mi-price" className="input" type="number" min={0} step="0.01" inputMode="decimal" value={draft.price} onChange={(event) => setDraft({ ...draft, price: event.target.value })} />
              </Field>
              <Field label="Category" htmlFor="mi-category">
                <input id="mi-category" className="input" list="menu-categories" placeholder="e.g. Mains" value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} />
                <datalist id="menu-categories">
                  {categories.map((entry) => (
                    <option key={entry.name} value={entry.name} />
                  ))}
                </datalist>
              </Field>
            </div>
            <Field label="Image link" htmlFor="mi-image" hint="Paste the link to a photo. Leave blank to use the category photo.">
              <input id="mi-image" className="input" type="url" inputMode="url" placeholder="https://…" value={draft.image_url} onChange={(event) => setDraft({ ...draft, image_url: event.target.value })} />
            </Field>
            <div className="switch-row">
              <div>
                <strong>Featured</strong>
                <p className="muted-note">Featured dishes are shown as popular on the home page.</p>
              </div>
              <Switch checked={draft.is_featured} onChange={(value) => setDraft({ ...draft, is_featured: value })} label="Featured" />
            </div>
            <div className="switch-row">
              <div>
                <strong>Active</strong>
                <p className="muted-note">Inactive dishes are hidden from the site and cannot be ordered.</p>
              </div>
              <Switch checked={draft.is_active} onChange={(value) => setDraft({ ...draft, is_active: value })} label="Active" />
            </div>
          </form>
        )}
      </Sheet>
    </>
  )
}
