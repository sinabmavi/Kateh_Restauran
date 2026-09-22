import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Bike, CalendarCheck, CreditCard, MapPin, Radar, ShoppingBag, Store } from 'lucide-react'
import { CategoryChips } from '../components/CategoryChips'
import { DishCard, DishCardSkeleton } from '../components/DishCard'
import { DishSheet } from '../components/DishSheet'
import { HeroCarousel } from '../components/HeroCarousel'
import { PromoBanner } from '../components/PromoBanner'
import { SearchBar } from '../components/SearchBar'
import { SectionHeader } from '../components/SectionHeader'
import { ErrorState, Reveal } from '../components/ui/primitives'
import { SmartImage } from '../components/ui/SmartImage'
import { useRequiredSettings } from '../context/SettingsContext'
import { useAddToCart } from '../hooks/useAddToCart'
import { useDocumentMeta } from '../hooks/useDocumentMeta'
import { useMenuItems } from '../hooks/useMenuItems'
import { brandCopy } from '../lib/brand'
import { buildCategories } from '../lib/categories'
import { formatMoney } from '../lib/format'
import { aboutImages } from '../lib/images'
import { parsePostcodeList } from '../../supabase/functions/_shared/rules'
import type { MenuItem } from '../lib/types'

const HOW_ICONS = [ShoppingBag, CreditCard, Radar]

export default function Home() {
  const settings = useRequiredSettings()
  const navigate = useNavigate()
  const menu = useMenuItems()
  const { addItem, orderingEnabled } = useAddToCart()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [selected, setSelected] = useState<MenuItem | null>(null)
  useDocumentMeta(null)

  const items = menu.data ?? []
  const categories = useMemo(() => buildCategories(items), [items])

  const dishes = useMemo(() => {
    if (category) {
      return items.filter((item) => item.category === category).sort((a, b) => Number(b.is_featured) - Number(a.is_featured) || a.name.localeCompare(b.name))
    }
    const featured = items.filter((item) => item.is_featured)
    return (featured.length > 0 ? featured : items).slice(0, 12)
  }, [items, category])

  const postcodes = parsePostcodeList(settings.delivery_postcodes)
  const viewAll = category ? `/menu?category=${encodeURIComponent(category)}` : '/menu'

  return (
    <div className="home">
      <div className="container home__top">
        <div className="home__search">
          <SearchBar
            value={query}
            onChange={setQuery}
            onSubmit={() => navigate(query.trim() ? `/menu?q=${encodeURIComponent(query.trim())}` : '/menu')}
            onFilter={() => navigate('/menu')}
          />
        </div>
        <HeroCarousel />
      </div>

      <section className="container home__section">
        {menu.loading && !menu.data ? (
          <div className="cats hscroll" aria-hidden>
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="cat">
                <span className="cat__circle skeleton" />
                <span className="skeleton" style={{ height: 10, width: 44 }} />
              </div>
            ))}
          </div>
        ) : (
          categories.length > 0 && <CategoryChips categories={categories} selected={category} onSelect={setCategory} />
        )}
      </section>

      <section className="container home__section">
        <SectionHeader title={category ? category : 'Popular dishes'} action={{ label: 'View all', to: viewAll }} />
        {menu.error ? (
          <ErrorState message={menu.error} onRetry={menu.reload} />
        ) : menu.loading && !menu.data ? (
          <div className="dish-row hscroll">
            {Array.from({ length: 4 }, (_, index) => (
              <DishCardSkeleton key={index} />
            ))}
          </div>
        ) : dishes.length === 0 ? (
          <p className="muted-note">The menu is being updated. Please check back shortly.</p>
        ) : (
          <div className="dish-row hscroll">
            {dishes.map((item) => (
              <DishCard key={item.id} item={item} currency={settings.currency} orderingEnabled={orderingEnabled} onOpen={setSelected} onQuickAdd={(dish) => addItem(dish)} />
            ))}
          </div>
        )}
      </section>

      <section className="container home__section">
        <Reveal>
          <PromoBanner />
        </Reveal>
      </section>

      <section className="about">
        <div className="container about__grid">
          <Reveal className="about__photos">
            <div className="about__photo about__photo--main">
              <SmartImage src={aboutImages.dining} alt="Guests seated in the warmly lit dining room" width={560} />
            </div>
            <div className="about__photo about__photo--a">
              <SmartImage src={aboutImages.plating} alt="A plate being finished at the pass" width={300} />
            </div>
            <div className="about__photo about__photo--b">
              <SmartImage src={aboutImages.guests} alt="Friends sharing dinner at a table" width={300} />
            </div>
          </Reveal>
          <Reveal className="about__copy" delay={120}>
            <p className="section-head__eyebrow">{brandCopy.about.eyebrow}</p>
            <h2 className="about__title">{brandCopy.about.title}</h2>
            {brandCopy.about.paragraphs.map((text) => (
              <p key={text}>{text}</p>
            ))}
            <ul className="about__tags">
              {brandCopy.about.highlights.map((text) => (
                <li key={text}>{text}</li>
              ))}
            </ul>
            <Link to="/reserve" className="btn btn--dark">
              Reserve your table
              <ArrowRight size={17} />
            </Link>
          </Reveal>
        </div>
      </section>

      <section className="container home__section">
        <SectionHeader title="How ordering works" eyebrow="Simple by design" />
        <div className="how">
          {brandCopy.howItWorks.map((step, index) => {
            const Icon = HOW_ICONS[index] ?? ShoppingBag
            return (
              <Reveal key={step.title} delay={index * 90}>
                <article className="how__step card">
                  <span className="how__num">{index + 1}</span>
                  <span className="how__icon">
                    <Icon size={24} />
                  </span>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </article>
              </Reveal>
            )
          })}
        </div>
      </section>

      <section className="container home__section">
        <Reveal>
          <div className="delivery card card--pad">
            <div className="delivery__lead">
              <span className="how__icon">
                <MapPin size={24} />
              </span>
              <div>
                <h2 className="delivery__title">Delivery and pickup</h2>
                <p className="delivery__text">
                  {settings.ordering_enabled
                    ? 'Order online and follow your order live from the kitchen to your door.'
                    : 'Online ordering is paused right now. You can still reserve a table.'}
                </p>
              </div>
            </div>
            <ul className="delivery__facts">
              <li>
                <Bike size={18} />
                <span>
                  Delivery {settings.delivery_enabled ? (settings.delivery_fee > 0 ? `· ${formatMoney(settings.delivery_fee, settings.currency)}` : '· Free') : 'is currently unavailable'}
                </span>
              </li>
              <li>
                <Store size={18} />
                <span>Pickup {settings.pickup_enabled ? 'available' : 'is currently unavailable'}</span>
              </li>
              {settings.min_order_amount > 0 && (
                <li>
                  <CalendarCheck size={18} />
                  <span>Minimum order {formatMoney(settings.min_order_amount, settings.currency)}</span>
                </li>
              )}
            </ul>
            {settings.delivery_area_note && <p className="delivery__note">{settings.delivery_area_note}</p>}
            {settings.delivery_enabled && postcodes.length > 0 && (
              <div className="delivery__codes" aria-label="Delivery postcodes">
                {postcodes.slice(0, 24).map((code) => (
                  <span key={code} className="badge">
                    {code}
                  </span>
                ))}
              </div>
            )}
          </div>
        </Reveal>
      </section>

      <DishSheet item={selected} currency={settings.currency} orderingEnabled={orderingEnabled} onClose={() => setSelected(null)} onAdd={(item, quantity, notes) => addItem(item, quantity, notes)} />
    </div>
  )
}
