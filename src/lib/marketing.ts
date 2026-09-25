import type { Audience, EmailMessage, RepeatPolicy, Schedule } from '../../supabase/functions/_shared/marketing.ts'

export type { Audience, EmailMessage, RepeatPolicy, Schedule } from '../../supabase/functions/_shared/marketing.ts'

/* ------------------------------------------------------------------ rows */

export interface MarketingEmailRow {
  id: string
  name: string
  message: EmailMessage
  audience: Audience
  mode: 'now' | 'scheduled' | 'automatic'
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed' | 'cancelled' | 'active' | 'paused'
  send_at: string | null
  frequency: Schedule['frequency'] | null
  weekdays: number[] | null
  month_day: number | null
  send_time: string | null
  repeat_policy: RepeatPolicy
  preset: string | null
  next_run_at: string | null
  last_run_at: string | null
  created_at: string
  updated_at: string
}

export interface MarketingRun {
  id: string
  email_id: string | null
  name: string
  subject: string
  kind: 'one_off' | 'automatic'
  message: EmailMessage
  status: 'sending' | 'sent' | 'partial' | 'failed'
  recipients_count: number
  sent_count: number
  failed_count: number
  started_at: string
  finished_at: string | null
}

export interface MarketingSend {
  id: number
  email: string
  full_name: string | null
  status: 'queued' | 'sending' | 'sent' | 'failed'
  error: string | null
  attempts: number
  sent_at: string | null
}

export interface MarketingSettingsRow {
  sender_name: string | null
  reply_to: string | null
  test_emails: string | null
  batch_size: number
  quiet_start: string | null
  quiet_end: string | null
}

export interface MarketingTemplate {
  id: string
  name: string
  message: EmailMessage
  created_at: string
}

/* ---------------------------------------------------------- message types */

export interface MessageType {
  key: string
  name: string
  description: string
  message: EmailMessage
}

const SIGN_OFF = 'Warm regards,\nThe team at {restaurant}'

function message(partial: Partial<EmailMessage> & Pick<EmailMessage, 'type' | 'subject' | 'title'>): EmailMessage {
  return {
    preheader: '',
    eyebrow: '',
    subtitle: '',
    body: '',
    image: { enabled: false, url: '', alt: '' },
    offer: { enabled: false, label: 'Your code', code: '', note: '' },
    button: { enabled: true, label: 'Visit our website', target: 'website', url: '' },
    closing: SIGN_OFF,
    ...partial,
  }
}

export const MESSAGE_TYPES: MessageType[] = [
  {
    key: 'birthday',
    name: 'Birthday',
    description: 'A birthday wish with a gift.',
    message: message({
      type: 'birthday',
      subject: 'Happy birthday, {first_name}! A gift from us',
      preheader: 'Celebrate with us, your birthday treat is inside.',
      eyebrow: 'Happy birthday',
      title: 'Happy birthday, {first_name}!',
      subtitle: 'A little gift from all of us',
      body: 'Everyone at {restaurant} wishes you a wonderful birthday full of joy, good company and great food.\n\nTo celebrate, your next dessert is on us. Treat yourself to saffron ice cream or baklava with your meal this month.',
      offer: { enabled: true, label: 'Your birthday gift', code: 'FREE DESSERT', note: 'Valid for 30 days · show this email when you visit or order' },
      button: { enabled: true, label: 'Book your celebration', target: 'reserve', url: '' },
    }),
  },
  {
    key: 'offer',
    name: 'Special offer',
    description: 'A limited-time treat for members.',
    message: message({
      type: 'offer',
      subject: '{first_name}, enjoy 15% off this week',
      preheader: 'A little something to make your week tastier.',
      eyebrow: 'Exclusive offer',
      title: 'A treat for our Club members',
      body: 'Hi {first_name}, as a valued member of our Customer Club we have a special offer just for you.\n\nEnjoy 15% off your order this week, whether you dine in, pick up or have it delivered to your door.',
      offer: { enabled: true, label: 'Your code', code: 'KATEH15', note: 'Valid this week only · show this email or quote the code' },
      button: { enabled: true, label: 'Order now', target: 'menu', url: '' },
    }),
  },
  {
    key: 'discount',
    name: 'Discount code',
    description: 'A code for money off the next order.',
    message: message({
      type: 'discount',
      subject: 'Your 20% discount is here, {first_name}',
      preheader: 'Use your code before it expires.',
      eyebrow: 'Discount',
      title: '20% off your next order',
      subtitle: 'Because you are part of the family',
      body: 'Hi {first_name}, here is a discount code just for you. Use it on any dish from our menu for dine-in, pickup or delivery.',
      offer: { enabled: true, label: 'Discount code', code: 'SAVE20', note: 'Valid until the end of the month · one use per customer' },
      button: { enabled: true, label: 'See the menu', target: 'menu', url: '' },
    }),
  },
  {
    key: 'welcome',
    name: 'Welcome',
    description: 'Greets new members.',
    message: message({
      type: 'welcome',
      subject: 'Welcome to the {restaurant} family, {first_name}!',
      preheader: 'A little welcome gift is waiting for you.',
      eyebrow: 'Welcome',
      title: 'Welcome to the family, {first_name}',
      body: 'Thank you for joining the {restaurant} Customer Club. We are delighted to have you with us.\n\nFrom saffron rice to char-grilled kebabs and slow-cooked stews, every dish is made the traditional Persian way. Enjoy a welcome treat on your first order or visit.',
      offer: { enabled: true, label: 'Your welcome code', code: 'WELCOME10', note: '10% off your first order · show this email or quote the code' },
      button: { enabled: true, label: 'Explore the menu', target: 'menu', url: '' },
    }),
  },
  {
    key: 'new_menu',
    name: 'New on the menu',
    description: 'Announces new dishes.',
    message: message({
      type: 'new_menu',
      subject: 'New on our menu: taste it first, {first_name}',
      preheader: 'Fresh flavours just arrived in our kitchen.',
      eyebrow: 'Just arrived',
      title: 'Something new from our kitchen',
      body: 'Hi {first_name}, our chefs have been busy creating new dishes inspired by the flavours of Persia.\n\nBe among the first to taste them, available now for dine-in, pickup and delivery.',
      button: { enabled: true, label: 'Discover the new dishes', target: 'menu', url: '' },
    }),
  },
  {
    key: 'event',
    name: 'Event invitation',
    description: 'Invites guests to a special night.',
    message: message({
      type: 'event',
      subject: 'You are invited: a Persian evening at {restaurant}',
      preheader: 'Live music, special dishes and a night to remember.',
      eyebrow: 'You are invited',
      title: 'Join us for a Persian evening',
      subtitle: 'Saturday · 7:30 PM',
      body: 'Dear {first_name}, join us for a special night of live traditional music and a set menu of Persian favourites.\n\nTables are limited, so reserve early to secure your place.',
      button: { enabled: true, label: 'Reserve your table', target: 'reserve', url: '' },
    }),
  },
  {
    key: 'winback',
    name: 'We miss you',
    description: 'Brings back guests who have not visited.',
    message: message({
      type: 'winback',
      subject: 'We miss you, {first_name}',
      preheader: 'It has been a while, come back for something special.',
      eyebrow: 'We miss you',
      title: 'It has been a while, {first_name}',
      body: 'Our kitchen has not been the same without you. The grill is hot, the rice is fluffy and your table is waiting.\n\nCome back and enjoy 10% off your next order.',
      offer: { enabled: true, label: 'Welcome back code', code: 'MISSYOU10', note: 'Valid for 14 days · show this email or quote the code' },
      button: { enabled: true, label: 'See what is new', target: 'menu', url: '' },
    }),
  },
  {
    key: 'holiday',
    name: 'Holiday greeting',
    description: 'Nowruz, Yalda and other celebrations.',
    message: message({
      type: 'holiday',
      subject: 'Nowruz Mobarak, {first_name}!',
      preheader: 'Happy Persian New Year from all of us.',
      eyebrow: 'Nowruz Mobarak',
      title: 'Happy Persian New Year',
      body: 'Dear {first_name}, as spring arrives we wish you and your loved ones a new year full of health, happiness and prosperity.\n\nCelebrate with us: our festive Nowruz menu with Sabzi Polo ba Mahi is available throughout the holiday.',
      button: { enabled: true, label: 'Book a festive table', target: 'reserve', url: '' },
    }),
  },
  {
    key: 'thanks',
    name: 'Thank you',
    description: 'Thanks regulars and asks for a review.',
    message: message({
      type: 'thanks',
      subject: 'Thank you for dining with us, {first_name}',
      preheader: 'We would love to hear what you thought.',
      eyebrow: 'Thank you',
      title: 'Thank you for being a regular',
      body: 'Hi {first_name}, thank you for choosing {restaurant} again and again. Guests like you make our kitchen a happy place.\n\nIf you enjoyed your meals, a short review would mean the world to our small team.',
      button: { enabled: true, label: 'Visit our website', target: 'website', url: '' },
    }),
  },
  {
    key: 'announcement',
    name: 'Announcement',
    description: 'Opening hours, closures and news.',
    message: message({
      type: 'announcement',
      subject: 'News from {restaurant}',
      preheader: 'An update we wanted you to hear first.',
      eyebrow: 'News',
      title: 'An update from our kitchen',
      body: 'Hi {first_name}, we wanted to let you know about a change at {restaurant}.\n\nWrite your news here: new opening hours, a holiday closure or anything your guests should know.',
      button: { enabled: true, label: 'Visit our website', target: 'website', url: '' },
    }),
  },
  {
    key: 'blank',
    name: 'Start from scratch',
    description: 'An empty email in our style.',
    message: message({ type: 'blank', subject: '', title: '', eyebrow: '', body: 'Hi {first_name},\n\n', button: { enabled: false, label: '', target: 'website', url: '' } }),
  },
]

export function cloneMessage(value: EmailMessage): EmailMessage {
  return JSON.parse(JSON.stringify(value)) as EmailMessage
}

/* ------------------------------------------------------------ content checks */

const SPAM_WORDS = ['free!!!', '100% free', 'act now', 'guaranteed', 'winner', 'cash', 'urgent', 'click here', 'risk-free', 'limited time!!!', 'buy now']

export interface Check {
  ok: boolean
  warning?: boolean
  text: string
}

export function contentChecks(message: EmailMessage): Check[] {
  const subject = message.subject.trim()
  const letters = subject.replace(/[^A-Za-z]/g, '')
  const upper = letters.replace(/[^A-Z]/g, '').length
  const emoji = (subject.match(/\p{Extended_Pictographic}/gu) ?? []).length
  const all = `${message.subject} ${message.title} ${message.body} ${message.offer.note}`.toLowerCase()
  const spam = SPAM_WORDS.filter((word) => all.includes(word))
  const checks: Check[] = [
    { ok: subject.length > 0, text: subject ? 'Subject line added' : 'Add a subject line' },
    { ok: subject.length <= 60, warning: true, text: subject.length <= 60 ? 'Subject is a good length' : `Subject is long (${subject.length} characters). Under 60 reads best on phones` },
    { ok: message.title.trim().length > 0, text: message.title.trim() ? 'Title added' : 'Add a title' },
    { ok: message.body.trim().replace(/^Hi \{first_name\},?$/i, '').length > 0, text: 'Message text written' },
    { ok: message.preheader.trim().length > 0, warning: true, text: message.preheader.trim() ? 'Preview text added' : 'Add preview text so the inbox shows more than the subject' },
    { ok: !message.offer.enabled || message.offer.code.trim().length > 0, text: message.offer.enabled && !message.offer.code.trim() ? 'The code box is on but has no code' : 'Code box ready' },
    {
      ok: !message.button.enabled || (message.button.label.trim().length > 0 && (message.button.target !== 'custom' || /^https?:\/\/\S+\.\S+/.test(message.button.url.trim()))),
      text: message.button.enabled ? (message.button.label.trim() ? 'Button ready' : 'Give the button a label') : 'No button (fine)',
    },
    { ok: !message.image.enabled || (message.image.url.trim().length > 0 && message.image.alt.trim().length > 0), text: message.image.enabled && !message.image.url ? 'Upload the image or switch it off' : message.image.enabled && !message.image.alt.trim() ? 'Describe the image for screen readers' : 'Image ready' },
    { ok: !(letters.length > 8 && upper / letters.length > 0.6), warning: true, text: 'Subject is not in all capitals' },
    { ok: emoji <= 1 && (subject.match(/!/g) ?? []).length <= 1, warning: true, text: emoji > 1 || (subject.match(/!/g) ?? []).length > 1 ? 'Too many emojis or exclamation marks can land in spam' : 'Calm, friendly subject' },
    { ok: spam.length === 0, warning: true, text: spam.length ? `Avoid spam-like words: ${spam.join(', ')}` : 'No spam-like words' },
  ]
  return checks
}

export function blockingProblems(message: EmailMessage): string[] {
  return contentChecks(message)
    .filter((check) => !check.ok && !check.warning)
    .map((check) => check.text)
}
