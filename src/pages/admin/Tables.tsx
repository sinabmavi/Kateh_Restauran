import { useMemo, useState, type FormEvent } from 'react'
import { Armchair, Pencil, Plus, Users } from 'lucide-react'
import { AdminPageHead } from '../../components/admin'
import { EmptyState, ErrorState, Field, Skeleton, Switch } from '../../components/ui/primitives'
import { Sheet } from '../../components/ui/Sheet'
import { useToast } from '../../context/ToastContext'
import { useAsync } from '../../hooks/useAsync'
import { errorMessage, unwrap } from '../../lib/errors'
import { supabase } from '../../lib/supabase'
import type { RestaurantTable } from '../../lib/types'

interface Draft {
  id?: string
  table_name: string
  capacity: string
  area: string
  is_active: boolean
}

const EMPTY: Draft = { table_name: '', capacity: '2', area: '', is_active: true }

export default function TablesPage() {
  const toast = useToast()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const state = useAsync(async () => unwrap<RestaurantTable[]>(await supabase.from('restaurant_tables').select('*').order('table_name', { ascending: true })), [])

  const areas = useMemo(() => [...new Set((state.data ?? []).map((table) => table.area).filter((area): area is string => Boolean(area)))], [state.data])

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!draft) return
    const capacity = Number(draft.capacity)
    if (draft.table_name.trim().length === 0) return toast.error('Please give the table a name.')
    if (!Number.isInteger(capacity) || capacity < 1) return toast.error('Capacity must be a whole number of at least 1.')

    setBusy(true)
    try {
      const values = { table_name: draft.table_name.trim(), capacity, area: draft.area.trim() || null, is_active: draft.is_active }
      unwrap(draft.id ? await supabase.from('restaurant_tables').update(values).eq('id', draft.id) : await supabase.from('restaurant_tables').insert(values))
      toast.success(draft.id ? 'Table updated' : 'Table added')
      setDraft(null)
      state.reload()
    } catch (failure) {
      const message = errorMessage(failure)
      toast.error(/already exists|duplicate|unique/i.test(message) ? 'A table with that name already exists.' : message)
    } finally {
      setBusy(false)
    }
  }

  const toggleActive = async (table: RestaurantTable) => {
    try {
      unwrap(await supabase.from('restaurant_tables').update({ is_active: !table.is_active }).eq('id', table.id))
      toast.success(table.is_active ? `${table.table_name} deactivated. It is no longer offered to guests.` : `${table.table_name} is active again.`)
      state.reload()
    } catch (failure) {
      toast.error(errorMessage(failure))
    }
  }

  return (
    <>
      <AdminPageHead
        title="Restaurant Tables"
        subtitle="Guests are only offered active tables that fit their party. Tables with booking history cannot be deleted, so deactivate them instead."
        actions={
          <button type="button" className="btn btn--gold" onClick={() => setDraft({ ...EMPTY })}>
            <Plus size={17} /> Add table
          </button>
        }
      />

      {state.error ? (
        <ErrorState message={state.error} onRetry={state.reload} />
      ) : !state.data ? (
        <Skeleton style={{ height: 240, borderRadius: 22 }} />
      ) : state.data.length === 0 ? (
        <EmptyState
          icon={<Armchair size={28} />}
          title="No tables yet"
          text="Add your first table so guests can book."
          action={
            <button type="button" className="btn btn--gold" onClick={() => setDraft({ ...EMPTY })}>
              Add table
            </button>
          }
        />
      ) : (
        <div className="table-wrap card">
          <table className="dt">
            <thead>
              <tr>
                <th>Table</th>
                <th className="num">Seats</th>
                <th>Area</th>
                <th>Active</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {state.data.map((table) => (
                <tr key={table.id} className={table.is_active ? undefined : 'is-muted'}>
                  <td data-label="Table">
                    <strong>{table.table_name}</strong>
                  </td>
                  <td data-label="Seats" className="num">
                    <span className="dt__inline">
                      <Users size={15} /> {table.capacity}
                    </span>
                  </td>
                  <td data-label="Area">{table.area || <span className="muted-note">—</span>}</td>
                  <td data-label="Active">
                    <span className="dt__inline">
                      <Switch checked={table.is_active} onChange={() => void toggleActive(table)} label={`${table.table_name} active`} />
                      {table.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td data-label="">
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => setDraft({ id: table.id, table_name: table.table_name, capacity: String(table.capacity), area: table.area ?? '', is_active: table.is_active })}
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
        title={draft?.id ? 'Edit table' : 'Add table'}
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setDraft(null)}>
              Cancel
            </button>
            <button type="submit" form="table-form" className="btn btn--gold" disabled={busy}>
              {busy ? 'Saving…' : 'Save table'}
            </button>
          </>
        }
      >
        {draft && (
          <form id="table-form" className="form-grid" onSubmit={save}>
            <Field label="Table name" htmlFor="tb-name">
              <input id="tb-name" className="input" value={draft.table_name} onChange={(event) => setDraft({ ...draft, table_name: event.target.value })} data-autofocus />
            </Field>
            <Field label="Capacity (seats)" htmlFor="tb-capacity">
              <input id="tb-capacity" className="input" type="number" min={1} step={1} inputMode="numeric" value={draft.capacity} onChange={(event) => setDraft({ ...draft, capacity: event.target.value })} />
            </Field>
            <Field label="Area" htmlFor="tb-area" hint="For example: Main dining room, Terrace, Bar.">
              <input id="tb-area" className="input" list="table-areas" value={draft.area} onChange={(event) => setDraft({ ...draft, area: event.target.value })} />
              <datalist id="table-areas">
                {areas.map((area) => (
                  <option key={area} value={area} />
                ))}
              </datalist>
            </Field>
            <div className="switch-row">
              <div>
                <strong>Active</strong>
                <p className="muted-note">Inactive tables stay here but are never offered to guests.</p>
              </div>
              <Switch checked={draft.is_active} onChange={(value) => setDraft({ ...draft, is_active: value })} label="Active" />
            </div>
          </form>
        )}
      </Sheet>
    </>
  )
}
