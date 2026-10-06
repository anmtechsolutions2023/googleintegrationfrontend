import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'react-toastify'
import posService from '../../services/posService'
import WriteOffDetail from './WriteOffDetail'
import {
  WRITE_OFF_PERIODS, writeOffRange, matchesWriteOff, shortStamp, billDate,
  writeOffsCsv, downloadCsv, sourceLabel,
} from '../../utils/writeOffs'
import './writeoffs.css'

const money = (n) => (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pct = (n) => `${Math.round(Number(n) || 0)}%`

/**
 * Dues › Written off — every balance given up on in a period: how much, why,
 * by whom, and on which bills.
 *
 * The period and branch go to the server; reason, person and search narrow the
 * LIST here and never the totals, so the summary always describes the whole
 * period. Tapping a reason or a person in the split is the same filter as its
 * dropdown.
 *
 * Read-only: a write-off cannot be undone, so rows carry no actions. A row opens
 * its detail.
 *
 * @param {Object} props
 * @param {number} [props.refreshKey] - Bumped by the page to reload.
 */
const WriteOffRegister = ({ refreshKey = 0 }) => {
  const [period, setPeriod] = useState('month')
  const [custom, setCustom] = useState({ fromDate: '', toDate: '' })
  const [branches, setBranches] = useState([])
  const [branchId, setBranchId] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [reason, setReason] = useState('')
  const [by, setBy] = useState('')
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(null)

  useEffect(() => {
    // Optional context: no branch list just means no branch picker.
    posService.getPosBranches()
      .then((b) => setBranches(Array.isArray(b) ? b : []))
      .catch(() => setBranches([]))
  }, [])

  const range = useMemo(() => writeOffRange(period, custom), [period, custom])

  const load = useCallback(async () => {
    if (!range) {
      setData(null)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      setData(await posService.getWriteOffs({ ...range, ...(branchId ? { branchId } : {}) }))
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to load write-offs')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [range, branchId])

  useEffect(() => { load() }, [load, refreshKey])

  const s = data?.summary || {}
  const documents = useMemo(() => data?.documents || [], [data])
  const shown = useMemo(
    () => documents.filter((d) => matchesWriteOff(d, { reason, by, search })),
    [documents, reason, by, search],
  )
  const filtered = Boolean(reason || by || search.trim())
  const toggle = (setter, current, value) => setter(current === value ? '' : value)

  const exportCsv = () => {
    const from = data?.range?.from || 'from'
    const to = data?.range?.to || 'to'
    downloadCsv(`write-offs-${from}-to-${to}.csv`, writeOffsCsv(shown))
  }

  return (
    <div className="fd-wo">
      <div className="fd-wo-period">
        <div className="fd-dues-chips" role="group" aria-label="Period">
          {WRITE_OFF_PERIODS.map((p) => (
            <button
              key={p.key} type="button"
              className={`fd-dues-chip ${period === p.key ? 'is-on' : ''}`}
              aria-pressed={period === p.key}
              onClick={() => setPeriod(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>
        {period === 'custom' && (
          <span className="fd-wo-dates">
            <label>
              <span>From</span>
              <input
                type="date" value={custom.fromDate}
                onChange={(e) => setCustom((c) => ({ ...c, fromDate: e.target.value }))}
              />
            </label>
            <label>
              <span>To</span>
              <input
                type="date" value={custom.toDate}
                onChange={(e) => setCustom((c) => ({ ...c, toDate: e.target.value }))}
              />
            </label>
          </span>
        )}
        {data?.range && (
          <span className="fd-wo-window">{billDate(data.range.from)} – {billDate(data.range.to)}</span>
        )}
      </div>

      <div className="fd-wo-filters">
        {branches.length > 1 && (
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)} aria-label="Branch">
            <option value="">All branches</option>
            {branches.map((b) => (
              <option key={b.Id || b.id} value={b.Id || b.id}>{b.BranchName || b.Name}</option>
            ))}
          </select>
        )}
        <select value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason">
          <option value="">All reasons</option>
          {(data?.byReason || []).map((r) => <option key={r.Code} value={r.Code}>{r.Label}</option>)}
        </select>
        <select value={by} onChange={(e) => setBy(e.target.value)} aria-label="Written off by">
          <option value="">Anyone</option>
          {(data?.byUser || []).map((u) => <option key={u.Key} value={u.Key}>{u.Name}</option>)}
        </select>
        <input
          className="fd-menu-search fd-wo-search"
          placeholder="Invoice, name, mobile or note…"
          aria-label="Search write-offs"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          type="button" className="fd-btn fd-btn-outline fd-wo-export"
          onClick={exportCsv} disabled={!shown.length}
        >
          Export CSV
        </button>
      </div>

      {!range ? (
        <div className="fd-empty">Pick a start and end date.</div>
      ) : loading ? (
        <div className="fd-loading">Loading write-offs…</div>
      ) : !data ? (
        <div className="fd-empty">Write-offs could not be loaded.</div>
      ) : (
        <>
          <div className="fd-dues-kpis fd-wo-kpis">
            <div className="fd-dues-kpi">
              <span>Written off</span>
              <b className="is-written">₹{money(s.WrittenOff)}</b>
              <em>{s.Bills === 1 ? '1 invoice' : `${s.Bills || 0} invoices`} this period</em>
            </div>
            <div className="fd-dues-kpi">
              <span>Average</span>
              <b>₹{money(s.Average)}</b>
              <em>per invoice</em>
            </div>
            <div className="fd-dues-kpi">
              <span>Largest</span>
              <b>₹{money(s.Largest)}</b>
              {s.LargestNo && <em>{[s.LargestNo, s.LargestReason].filter(Boolean).join(' · ')}</em>}
            </div>
            <div className="fd-dues-kpi">
              <span>Share of sales</span>
              <b>{(Number(s.ShareOfInvoiced) || 0).toFixed(1)}%</b>
              <em>of ₹{money(s.Invoiced)} invoiced</em>
            </div>
          </div>
          <p className="fd-wo-basis">
            Counted by the day each balance was written off.
            {Number(s.OnEarlierBills) > 0 && (
              <> ₹{money(s.OnEarlierBills)} of it is on {s.EarlierBills === 1 ? 'a bill' : `${s.EarlierBills} bills`} from before this period.</>
            )}
          </p>

          {s.Bills > 0 && (
            <div className="fd-wo-splits">
              <section className="fd-wo-panel" aria-label="By reason">
                <h2>By reason <em>Tap one to filter the list</em></h2>
                {data.byReason.map((r) => (
                  <button
                    key={r.Code} type="button"
                    className={`fd-wo-bar ${reason === r.Code ? 'is-on' : ''}`}
                    aria-pressed={reason === r.Code}
                    onClick={() => toggle(setReason, reason, r.Code)}
                  >
                    <span className="fd-wo-bar-name">{r.Label} <em>· {r.Bills}</em></span>
                    <span className="fd-wo-bar-track" aria-hidden="true"><span style={{ width: `${r.Share}%` }} /></span>
                    <span className="fd-wo-bar-pct">{pct(r.Share)}</span>
                    <b>₹{money(r.Amount)}</b>
                  </button>
                ))}
              </section>
              <section className="fd-wo-panel" aria-label="Written off by">
                <h2>Written off by <em>Only admins can write off</em></h2>
                {data.byUser.map((u) => (
                  <button
                    key={u.Key} type="button"
                    className={`fd-wo-bar ${by === u.Key ? 'is-on' : ''}`}
                    aria-pressed={by === u.Key}
                    onClick={() => toggle(setBy, by, u.Key)}
                  >
                    <span className="fd-wo-bar-name">{u.Name} <em>· {u.Bills}</em></span>
                    <span className="fd-wo-bar-track" aria-hidden="true"><span style={{ width: `${u.Share}%` }} /></span>
                    <span className="fd-wo-bar-pct">{pct(u.Share)}</span>
                    <b>₹{money(u.Amount)}</b>
                  </button>
                ))}
              </section>
            </div>
          )}

          {filtered && (
            <div className="fd-wo-narrowed" role="status">
              Showing {shown.length} of {documents.length}. The totals above are for the whole period.
              <button
                type="button" className="fd-dues-link"
                onClick={() => { setReason(''); setBy(''); setSearch('') }}
              >
                Clear filters
              </button>
            </div>
          )}
          {data.truncated && (
            <div className="fd-wo-narrowed" role="status">
              This period has more write-offs than the list holds; the totals still count every one. Pick a shorter period to see them all.
            </div>
          )}

          {documents.length === 0 ? (
            <div className="fd-empty">Nothing was written off in this period.</div>
          ) : shown.length === 0 ? (
            <div className="fd-empty">No write-offs match these filters.</div>
          ) : (
            <>
              {/* Desktop: a table you scan. */}
              <div className="table-scroll-wrapper fd-dues-table-wrap">
                <table className="fd-ledger-table fd-dues-table fd-wo-table">
                  <thead>
                    <tr>
                      <th>Written off</th><th>Invoice</th><th>Billed</th><th>Customer</th>
                      <th className="num">Bill</th><th className="num">Paid</th>
                      <th className="num">Written off</th><th>Reason</th><th>By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((d) => (
                      <tr key={d.Id}>
                        <td className="fd-wo-mono">{shortStamp(d.WrittenOffAt)}</td>
                        <td>
                          <button
                            type="button" className="fd-wo-open"
                            onClick={() => setOpen(d)}
                            aria-label={`Open write-off on ${d.TransactionNo}`}
                          >
                            {d.TransactionNo}
                          </button>
                        </td>
                        <td>
                          {billDate(d.TransactionDate)}
                          {d.OnEarlierBill && <span className="fd-wo-earlier">earlier bill</span>}
                        </td>
                        <td>
                          <div className="fd-dues-who">
                            <span className={`fd-dues-name ${d.CustomerName ? '' : 'muted'}`}>{d.CustomerName || 'Walk-in'}</span>
                            {sourceLabel(d.Source) && <span className="fd-dues-sub">{sourceLabel(d.Source)}</span>}
                          </div>
                        </td>
                        <td className="num">₹{money(d.GrossAmount)}</td>
                        <td className="num muted">₹{money(d.Collected)}</td>
                        <td className="num fd-wo-amount">₹{money(d.WrittenOff)}</td>
                        <td>
                          <div className="fd-dues-who">
                            <span>{d.ReasonLabel}</span>
                            <span className="fd-dues-sub fd-wo-note">{d.Note ? `“${d.Note}”` : 'No note'}</span>
                          </div>
                        </td>
                        <td>{d.WrittenOffByName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Phone: cards; the whole card opens the detail. */}
              <ul className="fd-dues-cards">
                {shown.map((d) => (
                  <li key={d.Id}>
                    <button type="button" className="fd-dues-card fd-wo-card" onClick={() => setOpen(d)}>
                      <span className="fd-dues-card-row">
                        <span className="fd-ledger-no">{d.TransactionNo}</span>
                        <span className="fd-wo-amount">₹{money(d.WrittenOff)}</span>
                      </span>
                      <span className="fd-wo-card-line">{d.CustomerName || 'Walk-in'} · {d.ReasonLabel}</span>
                      <span className="fd-dues-sub">
                        {shortStamp(d.WrittenOffAt)} · by {d.WrittenOffByName}{d.OnEarlierBill ? ' · earlier bill' : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      <WriteOffDetail doc={open} onClose={() => setOpen(null)} />
    </div>
  )
}

export default WriteOffRegister
