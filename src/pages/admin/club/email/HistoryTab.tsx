import { useEffect, useMemo, useState } from 'react'
import { endOfDay, format, startOfDay, startOfMonth, subDays } from 'date-fns'
import { Download, Eye, History, RotateCcw, Search } from 'lucide-react'
import { Sheet } from '../../../../components/ui/Sheet'
import { EmptyState, ErrorState, Skeleton } from '../../../../components/ui/primitives'
import { useToast } from '../../../../context/ToastContext'
import { useAsync } from '../../../../hooks/useAsync'
import { marketingRetryFailed } from '../../../../lib/api'
import { errorMessage, unwrap } from '../../../../lib/errors'
import type { MarketingRun, MarketingSend } from '../../../../lib/marketing'
import { supabase } from '../../../../lib/supabase'
import { PreviewSheet } from './PreviewSheet'

type Range = 'all' | 'today' | '7' | '30' | 'month' | 'custom'

const RANGES: Array<[Range, string]> = [
  ['all', 'All'],
  ['today', 'Today'],
  ['7', '7 days'],
  ['30', '30 days'],
  ['month', 'This month'],
  ['custom', 'Custom'],
]

const STATUS: Record<MarketingRun['status'], { label: string; tone: string }> = {
  sending: { label: 'Sending', tone: 'badge--warn' },
  sent: { label: 'Sent', tone: 'badge--ok' },
  partial: { label: 'Partly sent', tone: 'badge--warn' },
  failed: { label: 'Failed', tone: 'badge--danger' },
}

const SEND_STATUS: Record<MarketingSend['status'], { label: string; tone: string }> = {
  queued: { label: 'Waiting', tone: '' },
  sending: { label: 'Sending', tone: 'badge--warn' },
  sent: { label: 'Sent', tone: 'badge--ok' },
  failed: { label: 'Failed', tone: 'badge--danger' },
}

function RunSheet({ run, onClose, onChanged }: { run: MarketingRun | null; onClose: () => void; onChanged: () => void }) {
  const toast = useToast()
  const [only, setOnly] = useState<'all' | 'failed'>('all')
  const [preview, setPreview] = useState(false)
  const [busy, setBusy] = useState(false)
  const sends = useAsync(async () => (run ? unwrap<MarketingSend[]>(await supabase.from('marketing_sends').select('id, email, full_name, status, error, attempts, sent_at').eq('run_id', run.id).order('id').limit(5000)) : []), [run?.id, run?.sent_count, run?.failed_count])

  const rows = (sends.data ?? []).filter((row) => only === 'all' || row.status === 'failed')

  const retry = async () => {
    if (!run) return
    setBusy(true)
    try {
      const result = await marketingRetryFailed(run.id)
      if (result.firstError && result.sent === 0) toast.error(`Still failing: ${result.firstError}`)
      else toast.success(`Retried ${result.retried}: ${result.sent} sent.`)
      sends.reload()
      onChanged()
    } catch (failure) {
      toast.error(errorMessage(failure))
    } finally {
      setBusy(false)
    }
  }

  const exportCsv = () => {
    const cell = (value: string | number | null) => `"${String(value ?? '').replace(/"/g, '""')}"`
    const lines = [['Name', 'Email', 'Status', 'Sent at', 'Error'].map(cell).join(','), ...(sends.data ?? []).map((row) => [row.full_name, row.email, row.status, row.sent_at ? format(new Date(row.sent_at), 'yyyy-MM-dd HH:mm') : '', row.error].map(cell).join(','))]
    const url = URL.createObjectURL(new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `email-${format(new Date(run!.started_at), 'yyyy-MM-dd')}.csv`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <>
      <Sheet open={Boolean(run) && !preview} onClose={onClose} placement="right" wide title={run?.name ?? ''}>
        {run && (
          <div className="mk-stack">
            <p className="muted-note">
              {run.subject} · {format(new Date(run.started_at), 'EEE d MMM yyyy, h:mm a')} · {run.kind === 'automatic' ? 'Automatic' : 'One-off'}
            </p>
            <div className="mk-stats">
              <div>
                <strong>{run.recipients_count}</strong>
                <span>Recipients</span>
              </div>
              <div>
                <strong>{run.sent_count}</strong>
                <span>Sent</span>
              </div>
              <div className={run.failed_count ? 'is-bad' : undefined}>
                <strong>{run.failed_count}</strong>
                <span>Failed</span>
              </div>
            </div>
            <div className="mk-row-actions">
              <button type="button" className="btn btn--soft btn--sm" onClick={() => setPreview(true)}>
                <Eye size={14} /> View email
              </button>
              {run.failed_count > 0 && (
                <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => void retry()}>
                  <RotateCcw size={14} /> {busy ? 'Retrying…' : 'Retry failed'}
                </button>
              )}
              <button type="button" className="btn btn--ghost btn--sm" disabled={!sends.data?.length} onClick={exportCsv}>
                <Download size={14} /> Export CSV
              </button>
            </div>

            <div className="filters" role="tablist">
              <button type="button" role="tab" aria-selected={only === 'all'} className={`chip${only === 'all' ? ' is-active' : ''}`} onClick={() => setOnly('all')}>
                Everyone
              </button>
              <button type="button" role="tab" aria-selected={only === 'failed'} className={`chip${only === 'failed' ? ' is-active' : ''}`} onClick={() => setOnly('failed')}>
                Failed {run.failed_count > 0 && <span className="chip__count">{run.failed_count}</span>}
              </button>
            </div>

            {sends.error ? (
              <ErrorState message={sends.error} onRetry={sends.reload} />
            ) : sends.loading && !sends.data ? (
              <Skeleton style={{ height: 160, borderRadius: 16 }} />
            ) : rows.length === 0 ? (
              <p className="muted-note">{only === 'failed' ? 'No failures.' : 'Nobody was due to receive this email.'}</p>
            ) : (
              <ul className="mk-recipients">
                {rows.map((row) => (
                  <li key={row.id}>
                    <div>
                      <strong>{row.full_name || row.email}</strong>
                      <small>{row.email}</small>
                      {row.error && <small className="mk-recipients__error">{row.error}</small>}
                    </div>
                    <span className={`badge ${SEND_STATUS[row.status].tone}`}>{SEND_STATUS[row.status].label}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Sheet>
      <PreviewSheet message={preview && run ? run.message : null} onClose={() => setPreview(false)} />
    </>
  )
}

export function HistoryTab({ refreshKey, onChanged }: { refreshKey: number; onChanged: () => void }) {
  const [range, setRange] = useState<Range>('30')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [kind, setKind] = useState<'all' | MarketingRun['kind']>('all')
  const [status, setStatus] = useState<'all' | MarketingRun['status']>('all')
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState<MarketingRun | null>(null)

  const bounds = useMemo(() => {
    const now = new Date()
    if (range === 'today') return [startOfDay(now), null] as const
    if (range === '7') return [startOfDay(subDays(now, 6)), null] as const
    if (range === '30') return [startOfDay(subDays(now, 29)), null] as const
    if (range === 'month') return [startOfMonth(now), null] as const
    if (range === 'custom') return [from ? startOfDay(new Date(`${from}T00:00`)) : null, to ? endOfDay(new Date(`${to}T00:00`)) : null] as const
    return [null, null] as const
  }, [range, from, to])

  const runs = useAsync(async () => {
    let query = supabase.from('marketing_runs').select('*').order('started_at', { ascending: false }).limit(500)
    if (bounds[0]) query = query.gte('started_at', bounds[0].toISOString())
    if (bounds[1]) query = query.lte('started_at', bounds[1].toISOString())
    return unwrap<MarketingRun[]>(await query)
  }, [bounds[0]?.getTime(), bounds[1]?.getTime(), refreshKey])

  const { reload } = runs
  const sending = (runs.data ?? []).some((run) => run.status === 'sending')
  useEffect(() => {
    if (!sending) return
    const timer = window.setInterval(reload, 5000)
    return () => window.clearInterval(timer)
  }, [sending, reload])

  const visible = (runs.data ?? []).filter((run) => {
    if (kind !== 'all' && run.kind !== kind) return false
    if (status !== 'all' && run.status !== status) return false
    const needle = search.trim().toLowerCase()
    return !needle || `${run.name} ${run.subject}`.toLowerCase().includes(needle)
  })

  const current = open ? ((runs.data ?? []).find((run) => run.id === open.id) ?? open) : null

  return (
    <div className="mk-stack">
      <div className="mk-card mk-history-filters">
        <div className="filters mk-ranges" role="tablist" aria-label="Date">
          {RANGES.map(([value, label]) => (
            <button key={value} type="button" role="tab" aria-selected={range === value} className={`chip${range === value ? ' is-active' : ''}`} onClick={() => setRange(value)}>
              {label}
            </button>
          ))}
        </div>
        {range === 'custom' && (
          <div className="mk-inline">
            <label className="mk-field">
              <span>From</span>
              <input type="date" className="input" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} />
            </label>
            <label className="mk-field">
              <span>To</span>
              <input type="date" className="input" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} />
            </label>
          </div>
        )}
        <div className="mk-inline">
          <label className="toolbar__search mk-grow">
            <Search size={16} />
            <input type="search" className="toolbar__input" placeholder="Search name or subject" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search history" />
          </label>
          <select className="select select--sm" value={kind} onChange={(event) => setKind(event.target.value as typeof kind)} aria-label="Type">
            <option value="all">All types</option>
            <option value="one_off">One-off</option>
            <option value="automatic">Automatic</option>
          </select>
          <select className="select select--sm" value={status} onChange={(event) => setStatus(event.target.value as typeof status)} aria-label="Status">
            <option value="all">Any status</option>
            <option value="sent">Sent</option>
            <option value="partial">Partly sent</option>
            <option value="failed">Failed</option>
            <option value="sending">Sending</option>
          </select>
        </div>
      </div>

      {runs.error ? (
        <ErrorState message={runs.error} onRetry={runs.reload} />
      ) : !runs.data ? (
        <Skeleton style={{ height: 220, borderRadius: 22 }} />
      ) : visible.length === 0 ? (
        <EmptyState icon={<History size={26} />} title="No emails in this period" text="Sent emails appear here, newest first." />
      ) : (
        <ul className="mk-list">
          {visible.map((run) => (
            <li key={run.id}>
              <button type="button" className="mk-item mk-item--button" onClick={() => setOpen(run)}>
                <div className="mk-item__date">
                  <strong>{format(new Date(run.started_at), 'd MMM')}</strong>
                  <span>{format(new Date(run.started_at), 'h:mm a')}</span>
                </div>
                <div className="mk-item__body">
                  <strong>{run.name}</strong>
                  <small>{run.subject}</small>
                  <small>
                    {run.kind === 'automatic' ? 'Automatic' : 'One-off'} · {run.sent_count}/{run.recipients_count} sent
                    {run.failed_count > 0 && <span className="mk-bad"> · {run.failed_count} failed</span>}
                  </small>
                </div>
                <span className={`badge ${STATUS[run.status].tone}`}>
                  {STATUS[run.status].label}
                  {run.status === 'sending' && ` ${run.sent_count}/${run.recipients_count}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <RunSheet
        run={current}
        onClose={() => setOpen(null)}
        onChanged={() => {
          runs.reload()
          onChanged()
        }}
      />
    </div>
  )
}
