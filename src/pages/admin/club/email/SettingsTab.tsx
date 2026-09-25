import { useEffect, useState, type FormEvent } from 'react'
import { Check, CircleAlert, RefreshCw, ShieldCheck } from 'lucide-react'
import { Field } from '../../../../components/ui/primitives'
import { useRequiredSettings } from '../../../../context/SettingsContext'
import { useToast } from '../../../../context/ToastContext'
import { useAsync } from '../../../../hooks/useAsync'
import { errorMessage, unwrap } from '../../../../lib/errors'
import type { MarketingSettingsRow } from '../../../../lib/marketing'
import { supabase } from '../../../../lib/supabase'

const DOMAIN = 'kateh.io'

async function txt(name: string, type: 'TXT' | 'MX'): Promise<string[]> {
  const response = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`)
  const body = (await response.json()) as { Answer?: Array<{ data: string }> }
  return (body.Answer ?? []).map((answer) => answer.data.replace(/"\s*"/g, '').replace(/^"|"$/g, ''))
}

interface DnsCheck {
  label: string
  ok: boolean
  detail: string
}

async function checkDomain(): Promise<DnsCheck[]> {
  const [mx, root, dmarc] = await Promise.all([txt(DOMAIN, 'MX'), txt(DOMAIN, 'TXT'), txt(`_dmarc.${DOMAIN}`, 'TXT')])
  const spf = root.find((record) => record.toLowerCase().startsWith('v=spf1'))
  const dmarcRecord = dmarc.find((record) => record.toLowerCase().startsWith('v=dmarc1'))
  return [
    { label: 'Mail server (MX)', ok: mx.length > 0, detail: mx.length ? mx.join(', ') : 'No MX record: add Hostinger’s mail servers in your DNS.' },
    {
      label: 'SPF',
      ok: Boolean(spf && /hostinger/i.test(spf)),
      detail: spf ? (/hostinger/i.test(spf) ? spf : `Found, but it does not include Hostinger: ${spf}`) : 'Missing. Add TXT @ "v=spf1 include:_spf.mail.hostinger.com ~all".',
    },
    { label: 'DMARC', ok: Boolean(dmarcRecord), detail: dmarcRecord ?? 'Missing. Add TXT _dmarc "v=DMARC1; p=none; rua=mailto:info@kateh.io".' },
  ]
}

export function SettingsTab({ current, onSaved }: { current: MarketingSettingsRow | null; onSaved: () => void }) {
  const settings = useRequiredSettings()
  const toast = useToast()
  const [form, setForm] = useState({ sender_name: '', reply_to: '', test_emails: '', batch_size: '40', quiet: false, quiet_start: '22:00', quiet_end: '08:00' })
  const [busy, setBusy] = useState(false)
  const dns = useAsync(checkDomain, [])

  useEffect(() => {
    if (!current) return
    setForm({
      sender_name: current.sender_name ?? '',
      reply_to: current.reply_to ?? '',
      test_emails: current.test_emails ?? '',
      batch_size: String(current.batch_size ?? 40),
      quiet: Boolean(current.quiet_start && current.quiet_end),
      quiet_start: current.quiet_start ?? '22:00',
      quiet_end: current.quiet_end ?? '08:00',
    })
  }, [current])

  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm((value) => ({ ...value, [key]: event.target.value }))

  const save = async (event: FormEvent) => {
    event.preventDefault()
    const batch = Number(form.batch_size)
    if (!Number.isInteger(batch) || batch < 1 || batch > 500) return toast.error('Emails per minute must be between 1 and 500.')
    if (form.reply_to.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.reply_to.trim())) return toast.error('The reply-to address does not look right.')
    setBusy(true)
    try {
      unwrap(
        await supabase
          .from('marketing_settings')
          .update({
            sender_name: form.sender_name.trim() || null,
            reply_to: form.reply_to.trim() || null,
            test_emails: form.test_emails.trim() || null,
            batch_size: batch,
            quiet_start: form.quiet ? form.quiet_start : null,
            quiet_end: form.quiet ? form.quiet_end : null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', 1),
      )
      toast.success('Settings saved')
      onSaved()
    } catch (failure) {
      toast.error(errorMessage(failure))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mk-stack">
      <form className="mk-card mk-section__body" onSubmit={(event) => void save(event)}>
        <h3 className="mk-h">Sending</h3>
        <Field label="Sender name" htmlFor="mk-sender" hint={`Shown in the inbox. Default: ${settings.restaurant_name}`}>
          <input id="mk-sender" className="input" maxLength={60} value={form.sender_name} placeholder={settings.restaurant_name} onChange={set('sender_name')} />
        </Field>
        <Field label="From address" htmlFor="mk-from" hint="Every email is sent from this mailbox.">
          <input id="mk-from" className="input" value="info@kateh.io" readOnly />
        </Field>
        <Field label="Replies go to" htmlFor="mk-reply" hint="Leave empty to use the restaurant email.">
          <input id="mk-reply" className="input" type="email" value={form.reply_to} placeholder={settings.restaurant_email ?? 'info@kateh.io'} onChange={set('reply_to')} />
        </Field>
        <Field label="Test addresses" htmlFor="mk-tests" hint="“Send me a test” goes here (up to 5, separated by commas). Empty = your own email.">
          <input id="mk-tests" className="input" value={form.test_emails} placeholder="you@gmail.com, manager@kateh.io" onChange={set('test_emails')} />
        </Field>
        <Field label="Emails per minute" htmlFor="mk-batch" hint="Big lists go out in batches so your mailbox stays within Hostinger’s limits.">
          <input id="mk-batch" className="input" type="number" min={1} max={500} value={form.batch_size} onChange={set('batch_size')} />
        </Field>
        <label className="mk-check">
          <input type="checkbox" className="club-check" checked={form.quiet} onChange={(event) => setForm((value) => ({ ...value, quiet: event.target.checked }))} />
          Don’t send at night
        </label>
        {form.quiet && (
          <div className="mk-inline">
            <label className="mk-field">
              <span>From</span>
              <input type="time" className="input" value={form.quiet_start} onChange={set('quiet_start')} />
            </label>
            <label className="mk-field">
              <span>Until</span>
              <input type="time" className="input" value={form.quiet_end} onChange={set('quiet_end')} />
            </label>
          </div>
        )}
        <div className="mk-row-actions">
          <button type="submit" className="btn btn--gold" disabled={busy}>
            {busy ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      </form>

      <section className="mk-card mk-section__body">
        <header className="mk-section__head">
          <h3 className="mk-h">
            <ShieldCheck size={18} /> Inbox check
          </h3>
          <button type="button" className="btn btn--ghost btn--sm" onClick={dns.reload} disabled={dns.loading}>
            <RefreshCw size={14} /> Check again
          </button>
        </header>
        <p className="muted-note">These records tell Gmail and Outlook that emails from {DOMAIN} are genuine, so they land in the inbox instead of spam.</p>
        {dns.error ? (
          <p className="muted-note">Could not check right now: {dns.error}</p>
        ) : !dns.data ? (
          <p className="muted-note">Checking…</p>
        ) : (
          <ul className="mk-dns">
            {dns.data.map((check) => (
              <li key={check.label} className={check.ok ? 'is-ok' : 'is-bad'}>
                {check.ok ? <Check size={16} /> : <CircleAlert size={16} />}
                <div>
                  <strong>{check.label}</strong>
                  <small>{check.detail}</small>
                </div>
              </li>
            ))}
            <li className="is-info">
              <CircleAlert size={16} />
              <div>
                <strong>DKIM</strong>
                <small>Turn it on in Hostinger → Emails → {DOMAIN} → DNS records. It signs every email.</small>
              </div>
            </li>
          </ul>
        )}
        <ul className="mk-tips">
          <li>Send a test to a Gmail address first and check the Spam and Promotions tabs.</li>
          <li>If a test lands in spam, open it and click “Not spam”. This teaches Gmail quickly.</li>
          <li>Keep subjects calm: avoid ALL CAPS, many “!” and many emojis.</li>
          <li>Emails are sent without tracking pixels, which helps them reach the inbox.</li>
        </ul>
      </section>
    </div>
  )
}
