import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import posService from '../../services/posService'
import TimeframePicker from '../../components/frontdesk/TimeframePicker'
import { SCOPES } from '../../constants'
import { useCan } from '../../hooks/useCan'
import './returns.css'

/**
 * The returns register — where a refund is tracked after it has happened.
 *
 * Every other screen answers this one invoice at a time. This one answers it
 * across the whole business: what came back, when, why, from whom, who handed
 * it over, and where the money went.
 *
 * Three things it deliberately does NOT do:
 *
 *  - It never shows Returns as a single number next to revenue. Gross, Returns
 *    and Net are three measures. Netting them into one is precisely what the
 *    old refund model did, and it meant last Tuesday's gross changed when
 *    somebody refunded on Friday.
 *  - It never re-derives its own range. The reports resolve `preset` on the
 *    server and echo the bounds back; the register is then queried with THOSE
 *    bounds, so the strip at the top and the rows underneath can never cover
 *    two different windows.
 *  - It never separates the money question from the quality question. Every
 *    figure carries its fault split, because "₹6,240 came back" is not
 *    actionable and "₹4,100 of it was our fault" is.
 */

const money = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 })
    .format(Number(n) || 0)

const pct = (n) => (n === null || n === undefined ? '—' : `${Number(n).toFixed(1)}%`)

const qty = (n) => {
  const v = Number(n) || 0
  return Number.isInteger(v) ? String(v) : v.toFixed(3).replace(/\.?0+$/, '')
}

const dateOnly = (d) => (d ? String(d).slice(0, 10) : '—')

const dateTime = (d) => {
  if (!d) return '—'
  const t = new Date(d)
  return Number.isNaN(t.getTime()) ? String(d).slice(0, 16).replace('T', ' ') : t.toLocaleString()
}

const SETTLEMENT_STATUSES = ['PENDING', 'SETTLED', 'FAILED']

// Whether the reason means WE got it wrong. The one cut that turns a refund
// register into a kitchen-quality signal — merged, the number says nothing.
const FAULT_FILTERS = [
  { value: '', label: 'Any reason' },
  { value: 'true', label: 'Our fault' },
  { value: 'false', label: 'Customer changed mind' },
]

const EMPTY_FILTERS = {
  reasonId: '', isFault: '', settlementStatus: '', contactDetailId: '',
  itemId: '', createdBy: '', minAmount: '', maxAmount: '', search: '',
}

const Metric = ({ label, value, sub, tone }) => (
  <div className={`fd-returns-metric${tone ? ` is-${tone}` : ''}`}>
    <span className="fd-returns-metric-label">{label}</span>
    <span className="fd-returns-metric-value">{value}</span>
    {sub && <span className="fd-returns-metric-sub">{sub}</span>}
  </div>
)

const Empty = ({ children }) => <div className="fd-empty">{children}</div>

const Returns = () => {
  // Same gate as the ledger itself: a credit note IS a transaction record.
  // Marking one settled moves money, which is WRITE.
  const canSettle = useCan(SCOPES.TRANSACTIONS_WRITE)
  const navigate = useNavigate()

  const [range, setRange] = useState({ preset: 'month', bucket: 'day' })
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [page, setPage] = useState(1)

  const [reports, setReports] = useState(null)
  const [reportsLoading, setReportsLoading] = useState(true)
  const [register, setRegister] = useState(null)
  const [registerLoading, setRegisterLoading] = useState(true)

  const [branches, setBranches] = useState([])
  const [reasons, setReasons] = useState([])
  const [queue, setQueue] = useState([])
  const [settling, setSettling] = useState(null)

  // Filter options are context, not content: one failing must not blank the
  // register it decorates.
  useEffect(() => {
    posService.getPosBranches().then(setBranches).catch(() => setBranches([]))
    posService.getReturnReasons().then(setReasons).catch(() => setReasons([]))
  }, [])

  const loadQueue = useCallback(() => {
    posService.getRefundSettlementQueue().then(setQueue).catch(() => setQueue([]))
  }, [])
  useEffect(() => { loadQueue() }, [loadQueue])

  // ── The period ────────────────────────────────────────────────────────────
  // Three reports over one range. allSettled, because losing the product panel
  // must not blank the money strip the screen exists for.
  const needsCustomDates = range.preset === 'custom' && (!range.fromDate || !range.toDate)

  useEffect(() => {
    if (needsCustomDates) { setReports(null); setReportsLoading(false); return undefined }
    let cancelled = false
    setReportsLoading(true)
    Promise.allSettled([
      posService.getSalesReport(range),
      posService.getReturnReasonsReport(range),
      posService.getReturnProductReport(range),
    ]).then(([sales, reasonsRep, products]) => {
      if (cancelled) return
      if (sales.status === 'rejected' && reasonsRep.status === 'rejected') {
        toast.error('Failed to load returns for this period')
        setReports(null)
      } else {
        setReports({
          sales: sales.status === 'fulfilled' ? sales.value : null,
          reasons: reasonsRep.status === 'fulfilled' ? reasonsRep.value : null,
          products: products.status === 'fulfilled' ? products.value : null,
        })
      }
      setReportsLoading(false)
    })
    return () => { cancelled = true }
  }, [range, needsCustomDates])

  // The bounds the SERVER resolved, whichever report answered. Using these for
  // the register rather than re-deriving `preset` here is what guarantees the
  // rows and the totals above them cover the same window.
  const resolved = useMemo(() => {
    const r = reports?.sales?.range || reports?.reasons?.range || reports?.products?.range
    return r ? { from: r.from, to: r.to } : null
  }, [reports])

  // A new period or a new filter starts at page one — staying on page 4 of a
  // result set that no longer has four pages reads as "no returns".
  useEffect(() => { setPage(1) }, [resolved, filters, range.branchId])

  // ── The register ──────────────────────────────────────────────────────────
  const loadRegister = useCallback(async () => {
    if (!resolved) { setRegister(null); setRegisterLoading(false); return }
    setRegisterLoading(true)
    try {
      const params = { page, limit: 25, fromDate: resolved.from, toDate: resolved.to }
      if (range.branchId) params.branchId = range.branchId
      Object.entries(filters).forEach(([k, v]) => {
        if (v !== '' && v !== undefined) params[k] = v
      })
      setRegister(await posService.getReturnsRegister(params))
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to load the returns register')
      setRegister(null)
    } finally {
      setRegisterLoading(false)
    }
  }, [resolved, filters, page, range.branchId])

  useEffect(() => { loadRegister() }, [loadRegister])

  const setFilter = (patch) => setFilters((f) => ({ ...f, ...patch }))
  const activeFilters = Object.values(filters).filter((v) => v !== '').length

  const settle = async (note, status) => {
    setSettling(note.Id)
    try {
      await posService.setRefundSettlement(note.Id, { SettlementStatus: status })
      toast.success(
        status === 'SETTLED'
          ? `${note.TransactionNo} marked handed over`
          : `${note.TransactionNo} marked ${status.toLowerCase()}`,
      )
      loadQueue()
      loadRegister()
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to update the refund')
    } finally {
      setSettling(null)
    }
  }

  const totals = register?.totals || {}
  const salesSummary = reports?.sales?.summary
  const reasonRows = reports?.reasons?.reasons || []
  const productRows = (reports?.products?.products || [])
    .slice()
    .sort((a, b) => (b.ReturnedAmount || 0) - (a.ReturnedAmount || 0))
  const pagination = register?.pagination || {}
  const totalPages = Number(pagination.totalPages) || 1

  return (
    <div className="fd-returns">
      <div className="fd-reports-header">
        <div>
          <h1>↩️ Returns</h1>
          <p className="fd-lead">
            Every credit note, across every invoice. A return is its own document —
            the sale it came off is never altered, which is why gross for a closed
            period cannot move.
          </p>
        </div>
      </div>

      <TimeframePicker
        value={range}
        onChange={setRange}
        onRefresh={() => { setRange({ ...range }); loadQueue() }}
        loading={reportsLoading || registerLoading}
        branches={branches}
        showBucket={false}
      />

      {needsCustomDates ? (
        <Empty>Pick a start and end date to run a custom range.</Empty>
      ) : (
        <>
          {reports?.sales?.range && (
            <div className="fd-range-note">
              Showing <strong>{reports.sales.range.from}</strong> to{' '}
              <strong>{reports.sales.range.to}</strong>
            </div>
          )}

          {/* ── Gross · Returns · Net ────────────────────────────────────────
              Three measures, never one. Netting them into a single revenue
              figure is exactly what made last Tuesday's gross change when
              somebody refunded on Friday. */}
          <div className="fd-returns-strip">
            <Metric
              label="Gross sales"
              value={money(salesSummary?.GrossAmount)}
              sub={`${salesSummary?.Documents ?? 0} invoices`}
            />
            <Metric
              label="Returned"
              tone="out"
              value={money(totals.ReturnedAmount ?? salesSummary?.ReturnedAmount)}
              sub={`${totals.ReturnCount ?? salesSummary?.ReturnCount ?? 0} credit notes · ${pct(salesSummary?.ReturnRate)} of gross`}
            />
            <Metric
              label="Net of returns"
              tone="net"
              value={money(salesSummary?.NetOfReturns)}
              sub="what the business actually kept"
            />
            <Metric
              label="Our fault"
              tone="fault"
              value={money(totals.FaultAmount ?? reports?.reasons?.totals?.FaultAmount)}
              sub="quality, wrong item, delay"
            />
            <Metric
              label="Awaiting hand-over"
              tone={queue.length > 0 ? 'pending' : undefined}
              value={String(queue.length)}
              sub={queue.length > 0 ? 'refunds recorded, money not yet out' : 'nothing outstanding'}
            />
          </div>

          {/* ── The worklist ────────────────────────────────────────────────
              Usually empty — a till refund is instant. It appears only when
              something is actually owed, so an empty queue costs no space. */}
          {queue.length > 0 && (
            <section className="fd-returns-panel is-queue">
              <div className="fd-section-title">
                Refunds recorded but not yet handed back
              </div>
              <div className="table-scroll-wrapper">
                <table className="fd-table">
                  <thead>
                    <tr>
                      <th>Credit note</th><th>Invoice</th><th>Customer</th>
                      <th className="num">Amount</th><th>Recorded</th>
                      {canSettle && <th>Action</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {queue.map((n) => (
                      <tr key={n.Id}>
                        <td className="fd-doc-no">{n.TransactionNo}</td>
                        <td>
                          {n.SaleId ? (
                            <Link to={`/frontdesk/ledger?doc=${n.SaleId}`} className="fd-link">
                              {n.SaleNo || 'View'}
                            </Link>
                          ) : <span className="muted">—</span>}
                        </td>
                        <td>{n.CustomerName || <span className="muted">Walk-in</span>}</td>
                        <td className="num strong">{money(n.GrossAmount)}</td>
                        <td>{dateTime(n.CreatedOn)}</td>
                        {canSettle && (
                          <td className="fd-returns-actions">
                            <button
                              className="fd-btn fd-btn-sm fd-btn-primary"
                              disabled={settling === n.Id}
                              onClick={() => settle(n, 'SETTLED')}
                            >
                              Handed over
                            </button>
                            <button
                              className="fd-btn fd-btn-sm fd-btn-outline"
                              disabled={settling === n.Id}
                              onClick={() => settle(n, 'FAILED')}
                            >
                              Failed
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <div className="fd-returns-2col">
            {/* ── Why ─────────────────────────────────────────────────────── */}
            <section className="fd-returns-panel">
              <div className="fd-section-title">Why goods came back</div>
              {reportsLoading ? (
                <div className="fd-loading">Loading…</div>
              ) : reasonRows.length === 0 ? (
                <Empty>Nothing came back in this period.</Empty>
              ) : (
                <div className="table-scroll-wrapper">
                  <table className="fd-table">
                    <thead>
                      <tr>
                        <th>Reason</th><th className="num">Notes</th>
                        <th className="num">Amount</th><th className="num">Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reasonRows.map((r) => (
                        <tr
                          key={r.ReasonId || r.ReasonName}
                          className={`is-clickable${filters.reasonId === r.ReasonId ? ' is-selected' : ''}`}
                          onClick={() => setFilter({
                            reasonId: filters.reasonId === r.ReasonId ? '' : (r.ReasonId || ''),
                          })}
                        >
                          <td>
                            {r.ReasonName || <span className="muted">Not recorded</span>}
                            {r.IsFault && <span className="fd-fault-chip">our fault</span>}
                          </td>
                          <td className="num">{r.ReturnCount}</td>
                          <td className="num strong">{money(r.ReturnedAmount)}</td>
                          <td className="num">
                            {pct(r.Share)}
                            <span className="fd-bar" style={{ '--w': `${Math.min(r.Share || 0, 100)}%` }} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* ── Which dishes ─────────────────────────────────────────────
                Ranked by amount, but the RATE is the number worth acting on: a
                dish that sells 500 and comes back 5 times is fine, one that
                sells 20 and comes back 5 times is a kitchen problem. */}
            <section className="fd-returns-panel">
              <div className="fd-section-title">
                What came back
                <span className="fd-section-note">rate, not count — a popular dish returns more simply by selling more</span>
              </div>
              {reportsLoading ? (
                <div className="fd-loading">Loading…</div>
              ) : productRows.length === 0 ? (
                <Empty>No items came back in this period.</Empty>
              ) : (
                <div className="table-scroll-wrapper">
                  <table className="fd-table">
                    <thead>
                      <tr>
                        <th>Item</th><th className="num">Back</th>
                        <th className="num">Sold</th><th className="num">Rate</th>
                        <th className="num">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productRows.map((p) => (
                        <tr
                          key={p.ItemId}
                          className={`is-clickable${filters.itemId === p.ItemId ? ' is-selected' : ''}`}
                          onClick={() => setFilter({
                            itemId: filters.itemId === p.ItemId ? '' : p.ItemId,
                          })}
                          title="Show the credit notes this item appears on"
                        >
                          <td>
                            {p.ItemName}
                            {p.CategoryName && <div className="muted small">{p.CategoryName}</div>}
                          </td>
                          <td className="num">{qty(p.QuantityReturned)}</td>
                          <td className="num muted">{qty(p.QuantitySold)}</td>
                          <td className={`num${Number(p.ReturnRate) >= 10 ? ' is-hot' : ''}`}>
                            {pct(p.ReturnRate)}
                          </td>
                          <td className="num strong">{money(p.ReturnedAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          {/* ── The register ───────────────────────────────────────────────── */}
          <section className="fd-returns-panel">
            <div className="fd-section-title">
              Credit note register
              {activeFilters > 0 && (
                <span className="fd-section-note">
                  {activeFilters} filter{activeFilters > 1 ? 's' : ''} applied
                </span>
              )}
            </div>

            <div className="fd-returns-filters">
              <input
                className="fd-menu-search"
                placeholder="Credit note, invoice no., customer or mobile…"
                value={filters.search}
                onChange={(e) => setFilter({ search: e.target.value })}
                aria-label="Search returns"
              />
              <select
                value={filters.reasonId}
                onChange={(e) => setFilter({ reasonId: e.target.value })}
                aria-label="Reason"
              >
                <option value="">All reasons</option>
                {reasons.map((r) => (
                  <option key={r.Id} value={r.Id}>{r.Name}</option>
                ))}
              </select>
              <select
                value={filters.isFault}
                onChange={(e) => setFilter({ isFault: e.target.value })}
                aria-label="Fault"
              >
                {FAULT_FILTERS.map((f) => (
                  <option key={f.value || 'any'} value={f.value}>{f.label}</option>
                ))}
              </select>
              <select
                value={filters.settlementStatus}
                onChange={(e) => setFilter({ settlementStatus: e.target.value })}
                aria-label="Settlement status"
              >
                <option value="">Any settlement</option>
                {SETTLEMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <input
                className="fd-input-sm"
                placeholder="Refunded by"
                value={filters.createdBy}
                onChange={(e) => setFilter({ createdBy: e.target.value })}
                aria-label="Refunded by"
              />
              <input
                className="fd-input-sm num" type="number" min="0" placeholder="Min ₹"
                value={filters.minAmount}
                onChange={(e) => setFilter({ minAmount: e.target.value })}
                aria-label="Minimum amount"
              />
              <input
                className="fd-input-sm num" type="number" min="0" placeholder="Max ₹"
                value={filters.maxAmount}
                onChange={(e) => setFilter({ maxAmount: e.target.value })}
                aria-label="Maximum amount"
              />
              {activeFilters > 0 && (
                <button className="fd-btn fd-btn-outline" onClick={() => setFilters(EMPTY_FILTERS)}>
                  Clear filters
                </button>
              )}
            </div>

            {/* Whole-set, not this page: "₹6,240 returned" must not change when
                somebody turns the page. */}
            {register && (
              <div className="fd-returns-subtotal">
                <strong>{money(totals.ReturnedAmount)}</strong> across{' '}
                <strong>{totals.ReturnCount || 0}</strong> credit note
                {totals.ReturnCount === 1 ? '' : 's'} matching these filters
                {' · '}net {money(totals.ReturnedNet)} + tax {money(totals.ReturnedTax)}
              </div>
            )}

            {registerLoading ? (
              <div className="fd-loading">Loading returns…</div>
            ) : !register || register.data.length === 0 ? (
              <Empty>
                {activeFilters > 0
                  ? 'No credit notes match these filters.'
                  : 'Nothing came back in this period.'}
              </Empty>
            ) : (
              <>
                <div className="table-scroll-wrapper">
                  <table className="fd-table fd-returns-table">
                    <thead>
                      <tr>
                        <th>Credit note</th><th>Invoice</th><th>Customer</th>
                        <th>Items</th><th>Reason</th><th>Refunded to</th>
                        <th className="num">Amount</th><th className="num">Of sale</th>
                        <th>Settlement</th><th>By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {register.data.map((n) => (
                        <tr key={n.Id}>
                          <td className="fd-doc-no">
                            {n.TransactionNo}
                            <div className="muted small">{dateOnly(n.TransactionDate)}</div>
                          </td>
                          <td>
                            {/* Straight into the invoice drawer, with the lines
                                and every other note against it. */}
                            {n.SaleId ? (
                              <button
                                type="button"
                                className="fd-link-btn"
                                onClick={() => navigate(`/frontdesk/ledger?doc=${n.SaleId}`)}
                              >
                                {n.SaleNo || 'View invoice'}
                              </button>
                            ) : <span className="muted">—</span>}
                            {n.BranchName && <div className="muted small">{n.BranchName}</div>}
                          </td>
                          <td>
                            {n.ContactDetailId ? (
                              <button
                                type="button"
                                className="fd-link-btn"
                                title="Everything this customer has returned"
                                onClick={() => setFilter({
                                  contactDetailId: filters.contactDetailId === n.ContactDetailId
                                    ? '' : n.ContactDetailId,
                                })}
                              >
                                {n.CustomerName || n.CustomerMobile || 'Customer'}
                              </button>
                            ) : <span className="muted">Walk-in</span>}
                            {n.CustomerMobile && <div className="muted small">{n.CustomerMobile}</div>}
                          </td>
                          <td className="fd-returns-items">
                            {n.ItemNames || <span className="muted">—</span>}
                            <div className="muted small">
                              {qty(n.QuantityReturned)} unit{Number(n.QuantityReturned) === 1 ? '' : 's'}
                              {' · '}{n.LineCount} line{Number(n.LineCount) === 1 ? '' : 's'}
                            </div>
                          </td>
                          <td>
                            {n.ReasonName || <span className="muted">Not recorded</span>}
                            {n.IsFault && <span className="fd-fault-chip">our fault</span>}
                            {n.Remarks && <div className="muted small">{n.Remarks}</div>}
                          </td>
                          <td>{n.RefundedTo || <span className="muted">—</span>}</td>
                          <td className="num strong fd-returned-amount">−{money(n.GrossAmount)}</td>
                          {/* Whether a whole meal came back or one side dish. */}
                          <td className="num">{pct(n.ShareOfSale)}</td>
                          <td>
                            <span className={`fd-settle-chip is-${String(n.SettlementStatus || 'PENDING').toLowerCase()}`}>
                              {n.SettlementStatus || 'PENDING'}
                            </span>
                            {n.SettlementRef && <div className="muted small">{n.SettlementRef}</div>}
                          </td>
                          <td className="fd-returns-by">
                            {n.CreatedBy || <span className="muted">—</span>}
                            <div className="muted small">{dateTime(n.CreatedOn)}</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {totalPages > 1 && (
                  <div className="fd-returns-pager">
                    <button
                      className="fd-btn fd-btn-outline"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      ← Previous
                    </button>
                    <span>
                      Page {pagination.page || page} of {totalPages}
                      {pagination.total != null && ` · ${pagination.total} credit notes`}
                    </span>
                    <button
                      className="fd-btn fd-btn-outline"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next →
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        </>
      )}
    </div>
  )
}

export default Returns
