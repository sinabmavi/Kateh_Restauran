import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { brandCopy } from '../lib/brand'
import { SmartImage } from './ui/SmartImage'

const AUTOPLAY_MS = 6500

export function HeroCarousel() {
  const slides = brandCopy.heroSlides
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const touchStart = useRef<number | null>(null)
  const reducedMotion = useRef(typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)

  useEffect(() => {
    if (paused || reducedMotion.current) return
    const timer = window.setTimeout(() => setIndex((current) => (current + 1) % slides.length), AUTOPLAY_MS)
    return () => window.clearTimeout(timer)
  }, [index, paused, slides.length])

  const go = (next: number) => setIndex((next + slides.length) % slides.length)

  return (
    <section
      className="hero"
      aria-roledescription="carousel"
      aria-label="Featured"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={(event) => {
        touchStart.current = event.touches[0].clientX
      }}
      onTouchEnd={(event) => {
        if (touchStart.current === null) return
        const delta = event.changedTouches[0].clientX - touchStart.current
        touchStart.current = null
        if (Math.abs(delta) > 48) go(index + (delta < 0 ? 1 : -1))
      }}
    >
      {slides.map((slide, slideIndex) => {
        const active = slideIndex === index
        return (
          <article key={slide.title} className={`hero__slide${active ? ' is-active' : ''}`} aria-hidden={!active} aria-roledescription="slide" aria-label={`${slideIndex + 1} of ${slides.length}`}>
            <SmartImage src={slide.image} alt={slide.imageAlt} width={900} eager={slideIndex === 0} className="hero__image" />
            <div className="hero__shade" />
            <div className="hero__content">
              <p className="hero__kicker">{slide.kicker}</p>
              <h1 className="hero__title">{slide.title}</h1>
              <p className="hero__text">{slide.text}</p>
              <Link to={slide.cta.to} className="btn btn--gold hero__cta" tabIndex={active ? 0 : -1}>
                {slide.cta.label}
                <ArrowRight size={17} />
              </Link>
            </div>
          </article>
        )
      })}
      <div className="hero__dots" role="tablist" aria-label="Choose slide">
        {slides.map((slide, dotIndex) => (
          <button
            key={slide.title}
            type="button"
            role="tab"
            aria-selected={dotIndex === index}
            aria-label={`Show slide ${dotIndex + 1}`}
            className={`hero__dot${dotIndex === index ? ' is-active' : ''}`}
            onClick={() => go(dotIndex)}
          />
        ))}
      </div>
    </section>
  )
}
