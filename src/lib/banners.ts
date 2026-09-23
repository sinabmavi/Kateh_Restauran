import { brandCopy, type HeroSlide } from './brand'
import { unwrap } from './errors'
import { supabase } from './supabase'
import type { HeroBanner } from './types'

const CACHE_KEY = 'kateh.heroBanners'

export const DEFAULT_SLIDES: HeroSlide[] = brandCopy.heroSlides

export async function fetchBanners(): Promise<HeroBanner[]> {
  return unwrap<HeroBanner[]>(await supabase.from('hero_banners').select('*').order('id', { ascending: true }))
}

function pick(value: string | null | undefined, fallback: string): string {
  return value?.trim() || fallback
}

/** Banner N overrides built-in slide N field by field; anything left blank keeps the default. */
export function mergeBanners(rows: HeroBanner[] | null | undefined): HeroSlide[] {
  const byId = new Map((rows ?? []).map((row) => [row.id, row]))
  return DEFAULT_SLIDES.map((slide, index) => {
    const row = byId.get(index + 1)
    if (!row) return slide
    const title = pick(row.title, slide.title)
    return {
      kicker: pick(row.kicker, slide.kicker),
      title,
      text: pick(row.description, slide.text),
      image: pick(row.image_url, slide.image),
      imageAlt: row.image_url?.trim() ? title : slide.imageAlt,
      cta: { label: pick(row.button_label, slide.cta.label), to: slide.cta.to },
    }
  })
}

export function readCachedBanners(): HeroBanner[] | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as HeroBanner[]) : null
  } catch {
    return null
  }
}

export function writeCachedBanners(rows: HeroBanner[]): void {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(rows))
  } catch {
    // Private mode or storage disabled: the slider still works, it just refetches.
  }
}
