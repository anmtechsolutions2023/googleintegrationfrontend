import React, { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'react-toastify'
import posService from '../../services/posService'
import { SCOPES } from '../../constants'
import { useCan } from '../../hooks/useCan'
import CollectFlow from '../../components/frontdesk/CollectFlow'
import DebtorDialog from '../../components/frontdesk/DebtorDialog'
import WriteOffRegister from '../../components/frontdesk/WriteOffRegister'
import { thisMonthRange } from '../../utils/writeOffs'
import ExportButton from '../../components/export/ExportButton'
import './ledger.css'
import './dues.css'

// The view lives in the address, so Finance and the write-off toast can link
// straight to the register.
const WRITTEN_OFF_VIEW = 'written-off'

const money = (n) => (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dateOnly = (d) => {
  if (!d) return '—'
  const iso = String(d).slice(0, 10)
  const [y, m, day] = iso.split('-')
  return y && m && day ? `${day}/${m}/${y}` : iso
}
const ageLabel = (days) => (days <= 0 ? 'Today' : days === 1 ? '1 day' : `${days} days`)
// More than a week owed is worth a second look; the chip says so.
const ageClass = (days) => (days > 30 ? 'is-late' : days > 7 ? 'is-old' : '')

const BUCKETS = [
  { key: '', label: 'All', count: 'all' },
  { key: 'today', label: 'Today', count: 'today' },
  { key: 'week', label: '1–7 days', count: 'week' },
  { key: 'month', label: '8–30 days', count: 'month' },
  { key: 'older', label: 'Over 30 days', count: 'older' },
]

/**
 * Dues — every sale still owed money, oldest first.
 *
 * Finance → Outstanding is a figure you read. This is the list you work
 * through: who owes what, since when, how to reach them, and a Collect button
 * on every row. The summary covers EVERY due whatever the filter, so the total
 * does not change because the list was narrowed to today.
 *
 * A written-off bill is settled and leaves this list at once, so the page has
 * a second view — Written off — that keeps the record: how much this month, why
 * and by whom, and every bill. It is for the books and for admins; a cashier
 * who can only collect sees the list exactly as before.
 */
const Dues = () => {
  // Taking the money is the cashier's job; giving it up is an admin's.
  const canCollect = useCan([SCOPES.POS_BILLING_WRITE, SCOPES.TRANSACTIONS_WRITE])
  // What was given up, and who gave it up, is read from the books.
  const canSeeWriteOffs = useCan([SCOPES.TRANSACTIONS_READ, SCOPES.TRANSACTIONS_WRITE])
  const [params, setParams] = useSearchParams()
  const view = canSeeWriteOffs && params.get('view') === WRITTEN_OFF_VIEW ? 'written-off' : 'owed'
  const setView = (next) => setParams((prev) => {
    const p = new URLSearchParams(prev)
    if (next === 'written-off') p.set('view', WRITTEN_OFF_VIEW)
    else p.delete('view')
    return p
  }, { replace: true })
  // This month's write-offs, for the card and the switch. Null until known.
  const [month, setMonth] = useState(null)
  const [registerKey, setRegisterKey] = useState(0)
  const [data, setData] = useState({ summary: { outstanding: 0, count: 0, oldestDays: 0, buckets: {} }, documents: [] })
  const [loading, setLoading] = useState(true)
  const [age, setAge] = useState('')
  const [search, setSearch] = useState('')
  const [target, setTarget] = useState(null)
  const [start, setStart] = useState('collect')
  const [naming, setNaming] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (age) params.age = age
      if (search.trim()) params.search = search.trim()
      setData(await posService.getDues(params))
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to load dues')
    } finally {
      setLoading(false)
    }
  }, [age, search])

  useEffect(() => {
    const t = setTimeout(load, search ? 250 : 0)
    return () => clearTimeout(t)
  }, [load, search])

  // Decoration, not the page: if it cannot be read, the card and the count
  // simply stay away and the dues list carries on.
  const loadMonth = useCallback(async () => {
    if (!canSeeWriteOffs) return
    try {
      const r = await posService.getWriteOffs(thisMonthRange())
      setMonth(r?.summary || null)
    } catch {
      setMonth(null)
    }
  }, [canSeeWriteOffs])

  useEffect(() => { loadMonth() }, [loadMonth])

  // After a collection or a write-off: the list, the month, and the register.
  const changed = () => {
    load()
    loadMonth()
    setRegisterKey((k) => k + 1)
  }
  const refresh = () => {
    if (view === 'written-off') setRegisterKey((k) => k + 1)
    else load()
    loadMonth()
  }

  const { summary, documents } = data
  const open = (d, how = 'collect') => {
    setStart(how)
    setTarget({
      Id: d.Id,
      TransactionNo: d.TransactionNo,
      GrossAmount: d.GrossAmount,
      Paid: d.Collected,
      Due: d.Due,
      CustomerName: d.CustomerName,
      BranchId: d.BranchId,
      label: d.Source?.label || null,
    })
  }

  const who = (d) => (d.CustomerName ? (
    <>
      <span className="fd-dues-name">{d.CustomerName}</span>
      {d.CustomerMobile && <span className="fd-dues-sub">{d.CustomerMobile}</span>}
    </>
  ) : (
    <>
      <span className="fd-dues-name muted">Walk-in</span>
      {canCollect && !d.HasGuest && (
        <button type="button" className="fd-dues-link" onClick={() => setNaming(d)}>Add name</button>
      )}
    </>
  ))

  const actions = (d) => canCollect && (
    <span className="fd-dues-actions">
      <button type="button" className="fd-btn fd-btn-success fd-btn-sm" onClick={() => open(d)}>Collect</button>
    </span>
  )

  const monthName = new Date().toLocaleString('en-IN', { month: 'long' })

  return (
    <div className="fd-dues">
      <div className="fd-dues-head">
        <div>
          <h1>Dues</h1>
          <p className="fd-dues-lead">
            {view === 'written-off'
              ? 'Balances given up on: how much, why, by whom, and on which bills. A write-off cannot be undone.'
              : 'Bills paid short, oldest first. Each stays here until the rest is collected or written off.'}
          </p>
        </div>
        <div className="fd-dues-actions">
          {view === 'owed' && (
            <ExportButton
              exportKey="dues"
              context={{
                filters: { age, search: search.trim() },
                filterLabels: [age && `Age: ${age}`, search.trim() && `Search: “${search.trim()}”`].filter(Boolean),
              }}
            />
          )}
          <button
            type="button" className="fd-btn fd-btn-outline"
            onClick={refresh} disabled={view === 'owed' && loading}
          >
            Refresh
          </button>
        </div>
      </div>

      {canSeeWriteOffs && (
        <div className="fd-dues-views" role="group" aria-label="Dues views">
          <button
            type="button" className={`fd-dues-view ${view === 'owed' ? 'is-on' : ''}`}
            aria-pressed={view === 'owed'} onClick={() => setView('owed')}
          >
            Owed now <em className="is-due">{summary.count}</em>
          </button>
          <button
            type="button" className={`fd-dues-view ${view === 'written-off' ? 'is-on' : ''}`}
            aria-pressed={view === 'written-off'} onClick={() => setView('written-off')}
          >
            Written off {month && <em className="is-written">{month.Bills} this month</em>}
          </button>
        </div>
      )}

      {view === 'written-off' ? (
        <WriteOffRegister refreshKey={registerKey} />
      ) : (
      <>
      <div className={`fd-dues-kpis ${canSeeWriteOffs && month ? 'has-writeoffs' : ''}`}>
        <div className="fd-dues-kpi">
          <span>Outstanding</span>
          <b className="is-due">₹{money(summary.outstanding)}</b>
        </div>
        <div className="fd-dues-kpi">
          <span>Invoices</span>
          <b>{summary.count}</b>
          {summary.buckets?.month + summary.buckets?.older > 0 && (
            <em>{summary.buckets.month + summary.buckets.older} older than a week</em>
          )}
        </div>
        <div className="fd-dues-kpi">
          <span>Oldest</span>
          <b>{summary.count ? ageLabel(summary.oldestDays) : '—'}</b>
          {summary.oldestNo && <em>{[summary.oldestNo, summary.oldestName].filter(Boolean).join(' · ')}</em>}
        </div>
        {/* What left this list by being given up on, this month. Like the
            cards beside it, it ignores the age chips and the search. */}
        {canSeeWriteOffs && month && (
          <button type="button" className="fd-dues-kpi is-writeoff" onClick={() => setView('written-off')}>
            <span>Written off · {monthName}</span>
            <b className="is-written">₹{money(month.WrittenOff)}</b>
            <em>{month.Bills === 1 ? '1 invoice' : `${month.Bills} invoices`} this month</em>
            <strong>See every write-off →</strong>
          </button>
        )}
      </div>

      <div className="fd-dues-filters">
        <div className="fd-dues-chips" role="group" aria-label="How long it has been owed">
          {BUCKETS.map((b) => (
            <button
              key={b.key || 'all'} type="button"
              className={`fd-dues-chip ${age === b.key ? 'is-on' : ''}`}
              aria-pressed={age === b.key}
              onClick={() => setAge(b.key)}
            >
              {b.label} <em>{summary.buckets?.[b.count] ?? 0}</em>
            </button>
          ))}
        </div>
        <input
          className="fd-menu-search fd-dues-search"
          placeholder="Invoice, name, mobile or table…"
          aria-label="Search dues"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="fd-loading">Loading dues…</div>
      ) : documents.length === 0 ? (
        <div className="fd-empty">
          {summary.count === 0
            ? 'Nothing is owed. A bill paid short at the till appears here until the rest is collected.'
            : 'No dues match this filter.'}
        </div>
      ) : (
        <>
          {/* Desktop: a table you scan. */}
          <div className="table-scroll-wrapper fd-dues-table-wrap">
            <table className="fd-ledger-table fd-dues-table">
              <thead>
                <tr>
                  <th>Invoice</th><th>Billed</th><th>Age</th><th>Table / token</th><th>Customer</th>
                  <th className="num">Paid of total</th><th className="num">Due</th><th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {documents.map((d) => (
                  <tr key={d.Id}>
                    <td>
                      <Link className="fd-ledger-no" to={`/money/ledger?doc=${d.Id}`}>{d.TransactionNo}</Link>
                    </td>
                    <td>{dateOnly(d.TransactionDate)}</td>
                    <td><span className={`fd-dues-age ${ageClass(d.AgeDays)}`}>{ageLabel(d.AgeDays)}</span></td>
                    <td>
                      {d.Source?.label
                        ? <span className={`fd-source-chip is-${d.Source.kind}`}>{d.Source.kind === 'token' ? `Token ${d.Source.label}` : d.Source.label}</span>
                        : <span className="muted">—</span>}
                    </td>
                    <td><div className="fd-dues-who">{who(d)}</div></td>
                    <td className="num">₹{money(d.Collected)} <span className="muted">of ₹{money(d.GrossAmount)}</span></td>
                    <td className="num fd-dues-due">₹{money(d.Due)}</td>
                    <td className="num">{actions(d)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Phone: cards, with Collect under the thumb. */}
          <ul className="fd-dues-cards">
            {documents.map((d) => (
              <li key={d.Id} className="fd-dues-card">
                <div className="fd-dues-card-row">
                  <Link className="fd-ledger-no" to={`/money/ledger?doc=${d.Id}`}>{d.TransactionNo}</Link>
                  <span className={`fd-dues-age ${ageClass(d.AgeDays)}`}>{ageLabel(d.AgeDays)}</span>
                </div>
                <div className="fd-dues-who">
                  {d.Source?.label && <span className="fd-dues-sub">{d.Source.kind === 'token' ? `Token ${d.Source.label}` : d.Source.label}</span>}
                  {who(d)}
                </div>
                <div className="fd-dues-card-row">
                  <span className="fd-dues-due is-big">₹{money(d.Due)}</span>
                  {actions(d)}
                </div>
                <span className="fd-dues-sub">₹{money(d.Collected)} of ₹{money(d.GrossAmount)} paid</span>
              </li>
            ))}
          </ul>
        </>
      )}
      </>
      )}

      <CollectFlow doc={target} start={start} onClose={() => setTarget(null)} onChanged={changed} />
      <DebtorDialog
        doc={naming}
        onClose={() => setNaming(null)}
        onDone={() => { setNaming(null); load() }}
      />
    </div>
  )
}

export default Dues
