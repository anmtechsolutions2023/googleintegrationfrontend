import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import posService from '../../services/posService'
import BranchGstinList from '../../components/frontdesk/BranchGstinList'
import { useAuth } from '../../context/AuthContext'
import { hasScope } from '../../utils/permissions'
import { SCOPES } from '../../constants'

/**
 * Finance → GST.
 *
 * Two halves, kept visibly apart:
 *   * Filing — one calendar month for one GSTIN: checks, totals, the CA pack.
 *   * With and without GST — the report range from the page's timeframe.
 *
 * Every figure is read from ledger documents as issued, which is what lets the
 * pack tie out to the books rather than to the orders behind them.
 */

const money = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 })
    .format(Number(n) || 0)

const qty = (n) => {
  const v = Number(n) || 0
  return Number.isInteger(v) ? String(v) : v.toFixed(3).replace(/\.?0+$/, '')
}

const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

const MONTH_OPTIONS = (() => {
  const now = new Date()
  return Array.from({ length: 13 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    return { value: monthKey(d), label: d.toLocaleString('en-IN', { month: 'long', year: 'numeric' }) }
  })
})()

// Returns are filed for the month that has just ended, so that is the default.
const DEFAULT_PERIOD = MONTH_OPTIONS[1].value

const ACTIONS = {
  menu: { to: '/menu/items', label: 'Open Menu Master' },
  portals: { to: '/menu/channels/portals', label: 'Open Portals' },
  // Only offered to someone who cannot fix it here — see FilingSection.
  gstin: { to: '/outlet/tax/gst', label: 'Open GST Switch' },
}

const PACK_FILES = [
  'gstr3b_summary.csv', 'b2cs.csv', 'b2b.csv', 'cdnr.csv', 'exemp.csv',
  'hsn_b2c.csv', 'hsn_b2b.csv', 'docs.csv', 'eco.csv', 'invoice_register.csv',
]

const CheckIcon = ({ level }) => (level === 'ok' ? (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#27ae60" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" /><polyline points="8 12.5 11 15.5 16 9.5" />
  </svg>
) : (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={level === 'block' ? '#c0392b' : '#e67e22'} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3 2 21h20L12 3z" /><line x1="12" y1="10" x2="12" y2="14" /><line x1="12" y1="17.5" x2="12" y2="17.5" />
  </svg>
))

const Kpi = ({ label, value, accent, hint }) => (
  <div className={`fd-kpi-card ${accent || ''}`}>
    <span className="kpi-label">{label}</span>
    <span className="kpi-value">{value}</span>
    {hint && <span className="kpi-hint">{hint}</span>}
  </div>
)

const daysBetween = (from, to) => {
  const a = new Date(`${from}T00:00:00`)
  const b = new Date(`${to}T00:00:00`)
  return Math.max(1, Math.round((b - a) / 86400000) + 1)
}

const shortDate = (iso) => new Date(`${iso}T00:00:00`)
  .toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

/* ── Filing ────────────────────────────────────────────────────────────────── */
const FilingSection = ({ branches, range }) => {
  const [period, setPeriod] = useState(DEFAULT_PERIOD)
  const [branchId, setBranchId] = useState('')
  const [readiness, setReadiness] = useState(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState('')
  const [filedOn, setFiledOn] = useState('')
  // Bumped after a GSTIN is saved, so the checks run again against it.
  const [recheck, setRecheck] = useState(0)
  const { user } = useAuth() || {}
  // The same people the server lets set a GSTIN.
  const canEditGstin = hasScope(user, [
    SCOPES.TENANT_ADMIN, SCOPES.POS_CONFIG_WRITE, SCOPES.ORGANIZATION_WRITE,
  ])

  useEffect(() => {
    if (!branchId && branches.length > 0) setBranchId(branches[0].Id || branches[0].id)
  }, [branches, branchId])

  useEffect(() => {
    if (!branchId) return undefined
    let cancelled = false
    setLoading(true)
    posService.getGstReadiness(period, branchId)
      .then((r) => { if (!cancelled) setReadiness(r) })
      .catch((e) => {
        if (!cancelled) {
          setReadiness(null)
          toast.error(e?.response?.data?.message || 'Could not check this month')
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [period, branchId, recheck])

  const download = async () => {
    setBusy('pack')
    try {
      const name = await posService.downloadGstPack(period, branchId)
      toast.success(`Downloaded ${name}`)
    } catch (e) {
      toast.error(await posService.downloadErrorMessage(e, 'Could not build the pack'))
    } finally {
      setBusy('')
    }
  }

  const downloadWithoutGst = async () => {
    setBusy('without')
    try {
      const name = await posService.downloadSalesWithoutGst({
        fromDate: range?.from, toDate: range?.to, branchId,
      })
      toast.success(`Downloaded ${name}`)
    } catch (e) {
      toast.error(await posService.downloadErrorMessage(e, 'Could not export sales without GST'))
    } finally {
      setBusy('')
    }
  }

  const recordFiling = async () => {
    if (!filedOn) { toast.warn('Pick the date the return was filed'); return }
    setBusy('filing')
    try {
      await posService.recordGstFiling({ period, branchId, filedOn })
      toast.success('Filing recorded')
      setReadiness(await posService.getGstReadiness(period, branchId))
      setFiledOn('')
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Could not record the filing')
    } finally {
      setBusy('')
    }
  }

  const s = readiness?.summary

  return (
    <section className="fd-gst-section" aria-label="GST filing">
      <div className="fd-section-title">Filing export</div>

      <div className="fd-gst-controls">
        <label>
          <span>Month</span>
          <select value={period} onChange={(e) => setPeriod(e.target.value)}>
            {MONTH_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </label>
        <label>
          <span>Branch</span>
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            {branches.map((b) => (
              <option key={b.Id || b.id} value={b.Id || b.id}>
                {b.BranchName || b.Name}{b.GSTIN ? ` · ${b.GSTIN}` : ''}
              </option>
            ))}
          </select>
        </label>
        {readiness?.branch?.gstin && <span className="fd-gst-gstin">GSTIN {readiness.branch.gstin}</span>}
        {readiness?.filing && <span className="fd-badge fd-badge-success">Filed {readiness.filing.filedOn}</span>}
      </div>

      {branches.length === 0 ? (
        <div className="fd-empty">Add a branch with its GSTIN before exporting a return.</div>
      ) : loading && !readiness ? (
        <div className="fd-loading">Checking the month…</div>
      ) : readiness && (
        <>
          <div className="fd-gst-panel">
            <div className="fd-gst-panel-title">Before you send it</div>
            <ul className="fd-gst-checks">
              {readiness.checks.map((c) => (
                <li key={c.key} className={`is-${c.level}`}>
                  <CheckIcon level={c.level} />
                  <span>{c.text}</span>
                  {ACTIONS[c.action] && !(c.action === 'gstin' && canEditGstin) && (
                    <Link to={ACTIONS[c.action].to}>{ACTIONS[c.action].label}</Link>
                  )}
                </li>
              ))}
            </ul>
            {/* Fixed where it is noticed, rather than a trip to another screen
                and back to find the month again. */}
            {canEditGstin && readiness.branch && readiness.checks.some((c) => c.action === 'gstin') && (
              <div className="fd-gst-fix">
                <BranchGstinList
                  branches={[{ id: readiness.branch.id, name: readiness.branch.name, gstin: readiness.branch.gstin }]}
                  canWrite
                  onSaved={() => setRecheck((n) => n + 1)}
                />
              </div>
            )}
          </div>

          {s && (
            <div className="fd-kpi-grid fd-gst-kpis">
              <Kpi label="Taxable sales" value={money(s.taxable)} hint={`${s.invoices} invoices · ${s.creditNotes} credit notes`} />
              <Kpi label="CGST" value={money(s.cgst)} accent="accent-blue" />
              <Kpi label="SGST" value={money(s.sgst)} accent="accent-blue" />
              <Kpi label="Via aggregators" value={money(s.viaAggregators)} hint="Tax paid by the aggregator" />
              {s.withoutGst !== 0 && (
                <Kpi label="Without GST" value={money(s.withoutGst)} accent="accent-orange"
                     hint={`${s.withoutGstDocuments} documents`} />
              )}
            </div>
          )}

          <div className="fd-gst-panel">
            <div className="fd-gst-pack-head">
              <div>
                <div className="fd-gst-panel-title">CA pack — GSTR-1 and GSTR-3B</div>
                <p className="fd-gst-panel-sub">
                  CSV sheets in the GST offline tool&apos;s columns, a README with the checks above, and
                  the full invoice register — one zip.
                </p>
              </div>
              <button
                type="button"
                className="fd-btn fd-btn-primary"
                onClick={download}
                disabled={!!busy || readiness.blocked}
                title={readiness.blocked ? 'Resolve the blocking check first' : undefined}
              >
                {busy === 'pack' ? 'Building…' : 'Download pack (.zip)'}
              </button>
            </div>
            <div className="fd-gst-files">
              {PACK_FILES.map((f) => <code key={f}>{f}</code>)}
              {s?.withoutGstDocuments > 0 && <code>sales_without_gst.csv</code>}
            </div>
            <div className="fd-gst-filing">
              <label>
                <span>Filed on</span>
                <input type="date" value={filedOn} onChange={(e) => setFiledOn(e.target.value)} />
              </label>
              <button type="button" className="fd-btn fd-btn-outline" onClick={recordFiling} disabled={!!busy}>
                {busy === 'filing' ? 'Saving…' : 'Record filing date'}
              </button>
            </div>
          </div>
        </>
      )}

      <div className="fd-gst-ref-label">For your own reference</div>
      <div className="fd-gst-panel fd-gst-ref">
        <div>
          <div className="fd-gst-panel-title">Sales without GST</div>
          <p className="fd-gst-panel-sub">
            Every bill issued while GST was off, line by line, for the timeframe above
            {range?.from ? ` (${range.from} to ${range.to})` : ''}. Kept apart from the CA pack; in
            months GST was off the pack includes it too.
          </p>
        </div>
        <button
          type="button"
          className="fd-btn fd-btn-outline"
          onClick={downloadWithoutGst}
          disabled={!!busy || !range?.from}
        >
          {busy === 'without' ? 'Exporting…' : 'Download CSV'}
        </button>
      </div>
    </section>
  )
}

/* ── With and without GST ──────────────────────────────────────────────────── */
const SplitSection = ({ data }) => {
  const [view, setView] = useState('both')
  const periods = data?.periods || []
  const total = periods.reduce((sum, p) => sum + daysBetween(p.from, p.to), 0) || 1
  const products = useMemo(() => (data?.products || []).filter((p) => {
    if (view === 'with') return Number(p.grossWith) !== 0
    if (view === 'without') return Number(p.grossWithout) !== 0
    return true
  }), [data, view])

  const withGst = data?.withGst || {}
  const withoutGst = data?.withoutGst || {}

  return (
    <section className="fd-gst-section" aria-label="Sales with and without GST">
      <div className="fd-section-title">Sold with and without GST</div>

      {periods.length > 0 && (
        <div className="fd-gst-panel">
          <div className="fd-gst-strip">
            {periods.map((p) => (
              <div
                key={`${p.from}-${p.to}`}
                className={`fd-gst-strip-seg ${p.gstCharging ? 'is-on' : 'is-off'}`}
                style={{ flexGrow: daysBetween(p.from, p.to) / total }}
                title={`${p.from} to ${p.to}`}
              >
                GST {p.gstCharging ? 'on' : 'off'} · {shortDate(p.from)}
                {p.to !== p.from ? ` – ${shortDate(p.to)}` : ''}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="fd-kpi-grid">
        <Kpi label="Sold with GST" value={money(withGst.grossAmount)}
             hint={`${withGst.bills || 0} bills · taxable ${money(withGst.netAmount)}`} />
        <Kpi label="GST charged" value={money(withGst.taxAmount)} accent="accent-blue"
             hint={`CGST ${money(withGst.cgst)} · SGST ${money(withGst.sgst)}`} />
        <Kpi label="Sold without GST" value={money(withoutGst.grossAmount)}
             hint={`${withoutGst.bills || 0} bills · bill of supply`} />
      </div>

      <div className="fd-gst-panel">
        <div className="fd-gst-pack-head">
          <div className="fd-gst-panel-title">By product</div>
          <div className="fd-gst-chips" role="group" aria-label="Show">
            {[['both', 'Both'], ['with', 'With GST'], ['without', 'Without GST']].map(([key, label]) => (
              <button key={key} type="button" className={view === key ? 'is-on' : ''} onClick={() => setView(key)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        {products.length === 0 ? (
          <div className="fd-empty">Nothing sold in this period.</div>
        ) : (
          <div className="table-scroll-wrapper">
            <table className="fd-table">
              <thead>
                <tr>
                  <th>Item</th>
                  {view !== 'without' && <th className="num">Plates · GST</th>}
                  {view !== 'without' && <th className="num">Sales · GST</th>}
                  {view !== 'without' && <th className="num">GST</th>}
                  {view !== 'with' && <th className="num">Plates · no GST</th>}
                  {view !== 'with' && <th className="num">Sales · no GST</th>}
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.itemId || p.itemName}>
                    <td className="strong">{p.itemName}</td>
                    {view !== 'without' && <td className="num">{qty(p.qtyWith)}</td>}
                    {view !== 'without' && <td className="num">{money(p.grossWith)}</td>}
                    {view !== 'without' && <td className="num">{money(p.taxWith)}</td>}
                    {view !== 'with' && <td className="num">{qty(p.qtyWithout)}</td>}
                    {view !== 'with' && <td className="num">{money(p.grossWithout)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}

const GstFilingTab = ({ data, branches = [] }) => (
  <>
    <FilingSection branches={branches} range={data?.range} />
    <SplitSection data={data} />
  </>
)

export default GstFilingTab
