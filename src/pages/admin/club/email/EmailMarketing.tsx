import { useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { CircleAlert, MailCheck, PenLine, Plus, RefreshCw, Repeat, Send } from 'lucide-react'
import { AdminPageHead, MetricCard } from '../../../../components/admin'
import { ErrorState, Skeleton } from '../../../../components/ui/primitives'
import { useAsync } from '../../../../hooks/useAsync'
import { fetchCustomers, isReachable, isSetupMissing } from '../../../../lib/club'
import { unwrap } from '../../../../lib/errors'
import type { Audience, MarketingEmailRow, MarketingSettingsRow, MarketingTemplate } from '../../../../lib/marketing'
import { supabase } from '../../../../lib/supabase'
import { Composer, newDraft, type ComposerDraft } from './Composer'
import { HistoryTab } from './HistoryTab'
import { ScheduledTab } from './ScheduledTab'
import { SettingsTab } from './SettingsTab'

type Tab = 'create' | 'scheduled' | 'history' | 'settings'

const TABS: Array<[Tab, string]> = [
  ['create', 'Create'],
  ['scheduled', 'Automatic & scheduled'],
  ['history', 'History'],
  ['settings', 'Settings'],
]

export default function EmailMarketingPage() {
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const tab = (TABS.some(([value]) => value === params.get('tab')) ? params.get('tab') : 'create') as Tab
  const setTab = (next: Tab) => setParams(next === 'create' ? {} : { tab: next }, { replace: true })

  const incoming = (location.state as { audience?: Audience } | null)?.audience
  const [draft, setDraftState] = useState<ComposerDraft>(() => newDraft(incoming))
  const setDraft = (update: (current: ComposerDraft) => ComposerDraft) => setDraftState(update)
  const [historyKey, setHistoryKey] = useState(0)

  const customers = useAsync(fetchCustomers, [])
  const emails = useAsync(async () => unwrap<MarketingEmailRow[]>(await supabase.from('marketing_emails').select('*').order('created_at', { ascending: false }).limit(300)), [])
  const templates = useAsync(async () => unwrap<MarketingTemplate[]>(await supabase.from('marketing_templates').select('*').order('created_at', { ascending: false })), [])
  const marketingSettings = useAsync(async () => unwrap<MarketingSettingsRow | null>(await supabase.from('marketing_settings').select('*').eq('id', 1).maybeSingle()), [])
  const stats = useAsync(async () => {
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString()
    const head = { count: 'exact' as const, head: true }
    const [sent, failed] = await Promise.all([
      supabase.from('marketing_sends').select('id', head).eq('status', 'sent').gte('sent_at', since),
      supabase.from('marketing_sends').select('id', head).eq('status', 'failed').gte('created_at', since),
    ])
    if (sent.error) throw sent.error
    return { sent: sent.count ?? 0, failed: failed.count ?? 0 }
  }, [historyKey])

  const refreshAll = () => {
    customers.reload()
    emails.reload()
    templates.reload()
    marketingSettings.reload()
    setHistoryKey((value) => value + 1)
  }

  const startNew = () => {
    setDraftState(newDraft())
    setTab('create')
  }

  const edit = (next: ComposerDraft) => {
    setDraftState(next)
    setTab('create')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const finished = (next: 'history' | 'scheduled') => {
    setDraftState(newDraft())
    refreshAll()
    setTab(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const setupMissing = isSetupMissing(emails.error) || isSetupMissing(customers.error)
  const list = emails.data ?? []
  const active = list.filter((row) => row.status === 'active' || row.status === 'scheduled').length
  const subscribers = (customers.data ?? []).filter(isReachable).length

  return (
    <>
      <AdminPageHead
        title="Email Marketing"
        subtitle="Send beautiful emails from info@kateh.io in four easy steps."
        actions={
          <>
            <button type="button" className="btn btn--ghost btn--sm" onClick={refreshAll}>
              <RefreshCw size={15} /> Refresh
            </button>
            <button type="button" className="btn btn--gold btn--sm" onClick={startNew}>
              <Plus size={15} /> New email
            </button>
          </>
        }
      />

      {setupMissing ? (
        <div className="notice notice--info" role="status">
          Email Marketing is not set up in the database yet. Run <strong>11_email_marketing.sql</strong> in the Supabase SQL Editor, then refresh.
        </div>
      ) : (
        <>
          <div className="metrics mk-metrics">
            <MetricCard label="Subscribers" icon={<MailCheck size={20} />} tone="gold" value={customers.data ? subscribers : '…'} hint="Verified and subscribed" />
            <MetricCard label="Sent" icon={<Send size={20} />} tone="ok" value={stats.data ? stats.data.sent : '…'} hint="Last 30 days" />
            <MetricCard label="Automatic & scheduled" icon={<Repeat size={20} />} value={emails.data ? active : '…'} hint="Currently on" />
            <MetricCard label="Failed" icon={<CircleAlert size={20} />} tone={stats.data?.failed ? 'danger' : 'default'} value={stats.data ? stats.data.failed : '…'} hint="Last 30 days" />
          </div>

          <div className="tabs mk-tabs hscroll" role="tablist" aria-label="Email marketing">
            {TABS.map(([value, label]) => (
              <button key={value} type="button" role="tab" aria-selected={tab === value} className={`tabs__tab${tab === value ? ' is-active' : ''}`} onClick={() => setTab(value)}>
                {value === 'create' && <PenLine size={15} />}
                {label}
              </button>
            ))}
          </div>

          {tab === 'create' &&
            (customers.error ? (
              <ErrorState message={customers.error} onRetry={customers.reload} />
            ) : !customers.data ? (
              <Skeleton style={{ height: 320, borderRadius: 22 }} />
            ) : (
              <Composer
                draft={draft}
                setDraft={setDraft}
                customers={customers.data}
                templates={templates.data ?? []}
                marketingSettings={marketingSettings.data ?? null}
                onTemplatesChanged={templates.reload}
                onFinished={finished}
              />
            ))}

          {tab === 'scheduled' &&
            (emails.error ? (
              <ErrorState message={emails.error} onRetry={emails.reload} />
            ) : !emails.data || !customers.data ? (
              <Skeleton style={{ height: 320, borderRadius: 22 }} />
            ) : (
              <ScheduledTab emails={emails.data} customers={customers.data} onEdit={edit} onChanged={refreshAll} />
            ))}

          {tab === 'history' && <HistoryTab refreshKey={historyKey} onChanged={() => stats.reload()} />}

          {tab === 'settings' && <SettingsTab current={marketingSettings.data ?? null} onSaved={marketingSettings.reload} />}
        </>
      )}
    </>
  )
}
