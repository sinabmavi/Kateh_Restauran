// Clearly labelled brand copy. The restaurant *name* never lives here; it always comes from `restaurant_settings`.
// Edit this file to change the marketing wording on the public site.
import { heroImages } from './images'

export interface HeroSlide {
  kicker: string
  title: string
  text: string
  image: string
  imageAlt: string
  cta: { label: string; to: string }
}

export const brandCopy = {
  tagline: 'Persian & Iranian cuisine',

  heroSlides: [
    {
      kicker: 'Persian & Iranian',
      title: 'TASTE OF PERSIA.',
      text: 'Fragrant rice, slow-cooked stews and char-grilled kebabs, prepared the traditional way.',
      image: heroImages.steak,
      imageAlt: 'A char-grilled dish resting on a dark board',
      cta: { label: 'BOOK A TABLE', to: '/reserve' },
    },
    {
      kicker: 'Dinner at home',
      title: 'ORDER. PAY. TRACK.',
      text: 'Delivery or pickup, paid securely with PayPal, followed live from the pass to your door.',
      image: heroImages.plated,
      imageAlt: 'A plated steak with rosemary and asparagus',
      cta: { label: 'ORDER NOW', to: '/menu' },
    },
    {
      kicker: 'From the kitchen',
      title: 'COOKED OVER FLAME.',
      text: 'Every plate is cooked to order by our chefs, with nothing hurried and nothing hidden.',
      image: heroImages.chef,
      imageAlt: 'A chef working over an open flame',
      cta: { label: 'SEE THE MENU', to: '/menu' },
    },
    {
      kicker: 'Tonight',
      title: 'YOUR TABLE AWAITS.',
      text: 'Choose your party size and time, and we will have the candles lit and the table set.',
      image: heroImages.interior,
      imageAlt: 'A warmly lit restaurant dining room',
      cta: { label: 'RESERVE NOW', to: '/reserve' },
    },
  ] satisfies HeroSlide[],

  about: {
    eyebrow: 'The room',
    title: 'An evening, well spent.',
    paragraphs: [
      'Warm hospitality and the rich aromas of Persian cooking greet you from the moment you sit down. We built our dining room for long conversations and shared plates.',
      'Every guest is looked after by people who love food and take pride in getting the small things right, from the first drink to the last spoonful.',
    ],
    highlights: ['Persian & Iranian cuisine', 'Dine-in · Takeaway · Delivery', 'Cooked to order'],
  },

  howItWorks: [
    { title: 'Order', text: 'Build your basket from the live menu, for delivery or pickup.' },
    { title: 'Pay with PayPal', text: 'Secure checkout. Card details never touch our servers.' },
    { title: 'Track live', text: 'Watch every step from accepted to on its way, with a live countdown.' },
  ],
}
