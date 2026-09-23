import { useState, type FormEvent } from 'react'
import { GalleryHorizontal, Pencil, RotateCcw } from 'lucide-react'
import { Sheet } from '../../components/ui/Sheet'
import { EmptyState, ErrorState, Field, Skeleton } from '../../components/ui/primitives'
import { SmartImage } from '../../components/ui/SmartImage'
import { useToast } from '../../context/ToastContext'
import { useAsync } from '../../hooks/useAsync'
import { DEFAULT_SLIDES, fetchBanners, mergeBanners, writeCachedBanners } from '../../lib/banners'
import { errorMessage, unwrap } from '../../lib/errors'
import { supabase } from '../../lib/supabase'
import type { HeroBanner } from '../../lib/types'
import { ImageUpload } from './ImageUpload'

interface Draft {
  id: number
  name: string
  kicker: string
  title: string
  description: string
  button_label: string
  image_url: string
}

function toDraft(row: HeroBanner): Draft {
  return {
    id: row.id,
    name: row.name,
    kicker: row.kicker ?? '',
    title: row.title ?? '',
    description: row.description ?? '',
    button_label: row.button_label ?? '',
    image_url: row.image_url ?? '',
  }
}

const isCustomised = (row: HeroBanner) => [row.kicker, row.title, row.description, row.button_label, row.image_url].some((value) => value?.trim())

export default function BannerSettings() {
  const toast = useToast()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const state = useAsync(fetchBanners, [])

  const rows = state.data ?? []
  const slides = mergeBanners(rows)
  const fallback = draft ? DEFAULT_SLIDES[draft.id - 1] : undefined

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!draft) return
    if (draft.image_url.trim() && !/^https?:\/\//i.test(draft.image_url.trim())) return toast.error('The image link must start with http:// or https://')

    setBusy(true)
    try {
      const values = {
        kicker: draft.kicker.trim() || null,
        title: draft.title.trim() || null,
        description: draft.description.trim() || null,
        button_label: draft.button_label.trim() || null,
        image_url: draft.image_url.trim() || null,
        updated_at: new Date().toISOString(),
      }
      const saved = unwrap<HeroBanner[]>(await supabase.from('hero_banners').update(values).eq('id', draft.id).select())
      if (saved.length === 0) throw new Error('You do not have permission to edit banners.')
      writeCachedBanners(rows.map((row) => (row.id === draft.id ? saved[0]! : row)))
      toast.success(`Banner ${draft.id} saved`)
      setDraft(null)
      state.reload()
    } catch (failure) {
      toast.error(errorMessage(failure))
    } finally {
      setBusy(false)
    }
  }

  const restoreDefaults = () => {
    if (draft) setDraft({ ...draft, kicker: '', title: '', description: '', button_label: '', image_url: '' })
  }

  return (
    <section className="banner-settings">
      <header>
        <h3 className="panel__title">Banner Settings</h3>
        <p className="muted-note">The 4 slides at the top of the home page. Changes appear on the site straight away. Leave a field blank to use the original text or photo.</p>
      </header>

      {state.error ? (
        <ErrorState message={state.error} onRetry={state.reload} />
      ) : !state.data ? (
        <Skeleton style={{ height: 260, borderRadius: 22 }} />
      ) : rows.length === 0 ? (
        <EmptyState icon={<GalleryHorizontal size={28} />} title="Banners are not set up yet" text="Run 06_hero_banners.sql in the Supabase SQL Editor, then reload this page." />
      ) : (
        <div className="table-wrap card">
          <table className="dt">
            <thead>
              <tr>
                <th>Banner</th>
                <th>Subtitle</th>
                <th>Button</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const slide = slides[row.id - 1]!
                return (
                  <tr key={row.id}>
                    <td data-label="Banner">
                      <span className="dish-cell">
                        <span className="dish-cell__thumb banner-settings__thumb">
                          <SmartImage src={slide.image} fallbackSrc={DEFAULT_SLIDES[row.id - 1]!.image} alt="" width={120} />
                        </span>
                        <span className="dt__stack">
                          <strong>
                            {row.id}. {row.name}
                          </strong>
                          <small className="dt__clamp">{slide.title}</small>
                        </span>
                      </span>
                    </td>
                    <td data-label="Subtitle">{slide.kicker}</td>
                    <td data-label="Button">
                      <span className="dt__badges">
                        <span className="badge">{slide.cta.label}</span>
                        {isCustomised(row) && <span className="badge badge--gold">Edited</span>}
                      </span>
                    </td>
                    <td data-label="">
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => setDraft(toDraft(row))}>
                        <Pencil size={14} /> Edit
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <Sheet
        open={Boolean(draft)}
        onClose={() => setDraft(null)}
        placement="right"
        title={draft ? `Edit banner ${draft.id}: ${draft.name}` : 'Edit banner'}
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setDraft(null)}>
              Cancel
            </button>
            <button type="submit" form="banner-form" className="btn btn--gold" disabled={busy || uploading}>
              {busy ? 'Saving…' : 'Save banner'}
            </button>
          </>
        }
      >
        {draft && fallback && (
          <form id="banner-form" className="form-grid" onSubmit={save}>
            <div className="image-preview">
              <SmartImage src={draft.image_url.trim() || null} fallbackSrc={fallback.image} alt="Banner preview" width={400} />
              <span className="image-preview__tag">{draft.image_url.trim() ? 'Live preview' : 'Original photo'}</span>
            </div>
            <ImageUpload
              label="Banner photo"
              folder="banners"
              value={draft.image_url}
              onChange={(url) => setDraft({ ...draft, image_url: url })}
              onBusyChange={setUploading}
              hint="Upload a photo from your computer or phone (up to 10 MB). Wide, landscape photos look best. Without one, the original photo is used."
            />
            <Field label="Subtitle" htmlFor="bn-kicker" hint={`Small line above the title. Original: “${fallback.kicker}”`}>
              <input id="bn-kicker" className="input" maxLength={60} placeholder={fallback.kicker} value={draft.kicker} onChange={(event) => setDraft({ ...draft, kicker: event.target.value })} data-autofocus />
            </Field>
            <Field label="Title" htmlFor="bn-title" hint={`Original: “${fallback.title}”`}>
              <input id="bn-title" className="input" maxLength={60} placeholder={fallback.title} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
            </Field>
            <Field label="Description" htmlFor="bn-desc" hint="The short paragraph under the title.">
              <textarea id="bn-desc" className="textarea" maxLength={220} placeholder={fallback.text} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
            </Field>
            <Field label="Button text" htmlFor="bn-button" hint={`The button still opens ${fallback.cta.to === '/menu' ? 'the menu' : 'the booking page'}. Original: “${fallback.cta.label}”`}>
              <input id="bn-button" className="input" maxLength={30} placeholder={fallback.cta.label} value={draft.button_label} onChange={(event) => setDraft({ ...draft, button_label: event.target.value })} />
            </Field>
            <button type="button" className="btn btn--ghost btn--sm" onClick={restoreDefaults}>
              <RotateCcw size={14} /> Restore original text and photo
            </button>
          </form>
        )}
      </Sheet>
    </section>
  )
}
