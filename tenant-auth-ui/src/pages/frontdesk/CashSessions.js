import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { useAuth } from '../../context/AuthContext'
import { hasScope } from '../../utils/permissions'
import { SCOPES } from '../../constants'
import posService from '../../services/posService'
import crudService from '../../services/crudService'
import './finance.css'

/**
 * Cash sessions — a cashier's shift at a till, and the day-close that
 * reconciles it.
 *
 * The whole screen exists to surface ONE number honestly: the variance between
 * what the drawer held and what the ledger says it should have held.
 *
 * Expected cash is never computed here. The server derives it from the ledger
 * (opening float plus every cash movement in the session's window) — if the
 * client could compute or send it, the variance would mean nothing. So the
 * close form asks only for the counted amount, and the expectation comes back
 * from the server as the answer.
 */

const money = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 })
    .format(Number(n) || 0)

const when = (d) => (d ? new Date(d).toLocaleString() : '—')

/** Variance is the point of the screen, so it is never rendered as a bare number. */
const Variance = ({ value }) => {
  const v = Number(value) || 0
  if (v === 0) return <span className="fd-variance ok">Balanced</span>
  const short = v < 0
  return (
    <span className={`fd-variance ${short ? 'short' : 'over'}`}>
      {short ? 'Short ' : 'Over '}{money(Math.abs(v))}
    </span>
  )
}

const CashSessions = () => {
  const { user } = useAuth()
  const canWrite = hasScope(user, [SCOPES.POS_BILLING_WRITE, SCOPES.TENANT_ADMIN])

  const [sessions, setSessions] = useState([])
  const [branches, setBranches] = useState([])
  const [loading, setLoading]   = useState(true)

  const [openForm, setOpenForm] = useState({ BranchDetailId: '', ShiftLabel: '', OpeningFloat: '' })
  const [openBusy, setOpenBusy] = useState(false)
  const [showOpen, setShowOpen] = useState(false)

  const [summary, setSummary]       = useState(null)
  const [summaryBusy, setSummaryBusy] = useState(false)
  const [closeTarget, setCloseTarget] = useState(null)
  const [counted, setCounted]       = useState('')
  const [notes, setNotes]           = useState('')
  const [closeBusy, setCloseBusy]   = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setSessions(await posService.getCashSessions({ limit: 100 }))
    } catch {
      toast.error('Failed to load cash sessions')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    crudService.getAll('branchDetails', { limit: 200 })
      .then((r) => setBranches(Array.isArray(r?.data) ? r.data : []))
      .catch(() => setBranches([]))
  }, [])

  const openTill = async (ev) => {
    ev.preventDefault()
    if (!openForm.BranchDetailId) { toast.warn('Pick a branch'); return }
    setOpenBusy(true)
    try {
      await posService.openCashSession({
        BranchDetailId: openForm.BranchDetailId,
        ShiftLabel: openForm.ShiftLabel || null,
        OpeningFloat: Number(openForm.OpeningFloat) || 0,
      })
      toast.success('Till opened')
      setShowOpen(false)
      setOpenForm({ BranchDetailId: '', ShiftLabel: '', OpeningFloat: '' })
      await load()
    } catch (e) {
      // The server refuses a second open till for the same cashier at the same
      // branch — surface that message rather than a generic failure.
      toast.error(e?.response?.data?.message || 'Failed to open till')
    } finally {
      setOpenBusy(false)
    }
  }

  /** Mid-shift check: what the drawer should hold right now, without closing. */
  const peek = async (session) => {
    setSummaryBusy(true)
    setSummary({ Id: session.Id })
    try {
      setSummary(await posService.getCashSessionSummary(session.Id))
    } catch {
      toast.error('Failed to load session summary')
      setSummary(null)
    } finally {
      setSummaryBusy(false)
    }
  }

  const startClose = async (session) => {
    setCloseTarget(session)
    setCounted('')
    setNotes('')
    // Show the expectation alongside the count field so the cashier sees what
    // they are being measured against.
    try {
      setSummary(await posService.getCashSessionSummary(session.Id))
    } catch {
      setSummary(null)
    }
  }

  const doClose = async () => {
    if (counted === '' || Number.isNaN(Number(counted))) {
      toast.warn('Enter the counted cash')
      return
    }
    setCloseBusy(true)
    try {
      const closed = await posService.closeCashSession(closeTarget.Id, {
        CountedCash: Number(counted),
        Notes: notes || null,
      })
      const variance = Number(closed.Variance) || 0
      if (variance === 0) toast.success('Till closed and balanced')
      else toast.warn(`Till closed — ${variance < 0 ? 'short' : 'over'} by ${money(Math.abs(variance))}`)
      setCloseTarget(null)
      setSummary(null)
      await load()
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to close till')
    } finally {
      setCloseBusy(false)
    }
  }

  const openSessions   = sessions.filter((s) => s.Status === 'open')
  const closedSessions = sessions.filter((s) => s.Status !== 'open')

  return (
    <div className="fd-cash-sessions">
      <div className="fd-reports-header">
        <div>
          <h1>🧮 Cash Sessions</h1>
          <p className="fd-lead">
            One till per cashier per shift. Expected cash is derived from the
            ledger, so the variance at close is a real number, not a guess.
          </p>
        </div>
        {canWrite && (
          <button className="fd-btn fd-btn-primary" onClick={() => setShowOpen(true)}>
            + Open till
          </button>
        )}
      </div>

      <div className="fd-section-title">Open tills</div>
      {loading ? (
        <div className="fd-loading">Loading sessions…</div>
      ) : openSessions.length === 0 ? (
        <div className="fd-empty">No till is open right now.</div>
      ) : (
        <div className="fd-session-grid">
          {openSessions.map((s) => (
            <div className="fd-session-card" key={s.Id}>
              <div className="fd-session-head">
                <div>
                  <strong>{s.CashierEmail}</strong>
                  <div className="muted small">
                    {s.BranchName || '—'}{s.ShiftLabel ? ` · ${s.ShiftLabel}` : ''}
                  </div>
                </div>
                <span className="fd-exp-status approved">Open</span>
              </div>
              <dl className="fd-session-facts">
                <div><dt>Opened</dt><dd>{when(s.OpenedAt)}</dd></div>
                <div><dt>Opening float</dt><dd>{money(s.OpeningFloat)}</dd></div>
              </dl>
              {summary?.Id === s.Id && !summaryBusy && (
                <div className="fd-session-expected">
                  <span>Expected in drawer now</span>
                  <strong>{money(summary.ExpectedCash)}</strong>
                </div>
              )}
              <div className="fd-session-actions">
                <button className="fd-btn fd-btn-sm fd-btn-outline" onClick={() => peek(s)}
                        disabled={summaryBusy}>
                  {summaryBusy && summary?.Id === s.Id ? 'Checking…' : 'Check drawer'}
                </button>
                {canWrite && (
                  <button className="fd-btn fd-btn-sm fd-btn-primary" onClick={() => startClose(s)}>
                    Close &amp; count
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="fd-section-title">Closed shifts</div>
      {closedSessions.length === 0 ? (
        <div className="fd-empty">No closed shifts yet.</div>
      ) : (
        <div className="fd-table-scroll">
          <table className="fd-table">
            <thead>
              <tr>
                <th>Cashier</th><th>Branch</th><th>Shift</th>
                <th>Opened</th><th>Closed</th>
                <th className="num">Float</th><th className="num">Expected</th>
                <th className="num">Counted</th><th>Variance</th>
              </tr>
            </thead>
            <tbody>
              {closedSessions.map((s) => (
                <tr key={s.Id}>
                  <td className="strong">{s.CashierEmail}</td>
                  <td>{s.BranchName || '—'}</td>
                  <td>{s.ShiftLabel || <span className="muted">—</span>}</td>
                  <td>{when(s.OpenedAt)}</td>
                  <td>{when(s.ClosedAt)}</td>
                  <td className="num">{money(s.OpeningFloat)}</td>
                  <td className="num">{money(s.ExpectedCash)}</td>
                  <td className="num strong">{money(s.CountedCash)}</td>
                  <td><Variance value={s.Variance} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showOpen && (
        <div className="fd-modal-backdrop" role="dialog" aria-label="Open till">
          <form className="fd-form-modal" onSubmit={openTill}>
            <h3>Open a till</h3>
            <p className="fd-variant-hint">
              You are accountable for this drawer until it is closed and counted.
            </p>

            <label htmlFor="cs-branch">Branch *</label>
            <select id="cs-branch" value={openForm.BranchDetailId} required
                    onChange={(e) => setOpenForm({ ...openForm, BranchDetailId: e.target.value })}>
              <option value="">Select a branch…</option>
              {branches.map((b) => (
                <option key={b.Id || b.id} value={b.Id || b.id}>{b.BranchName}</option>
              ))}
            </select>

            <label htmlFor="cs-shift">Shift</label>
            <input id="cs-shift" type="text" maxLength={50} value={openForm.ShiftLabel}
                   placeholder="Morning / Evening / Night"
                   onChange={(e) => setOpenForm({ ...openForm, ShiftLabel: e.target.value })} />

            <label htmlFor="cs-float">Opening float</label>
            <input id="cs-float" type="number" min="0" step="0.01" value={openForm.OpeningFloat}
                   onChange={(e) => setOpenForm({ ...openForm, OpeningFloat: e.target.value })} />
            <span className="fd-field-hint">Cash already in the drawer before trading.</span>

            <div className="fd-variant-actions">
              <button type="submit" className="fd-btn fd-btn-primary" disabled={openBusy}>
                {openBusy ? 'Opening…' : 'Open till'}
              </button>
              <button type="button" className="fd-btn fd-btn-outline"
                      onClick={() => setShowOpen(false)} disabled={openBusy}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {closeTarget && (
        <div className="fd-modal-backdrop" role="dialog" aria-label="Close till">
          <div className="fd-variant-modal">
            <h3>Close {closeTarget.CashierEmail}'s till</h3>

            {summary && (
              <div className="fd-close-expected">
                <div><span>Opening float</span><strong>{money(closeTarget.OpeningFloat)}</strong></div>
                <div><span>Expected in drawer</span><strong>{money(summary.ExpectedCash)}</strong></div>
              </div>
            )}

            <label htmlFor="cs-counted">Counted cash *</label>
            <input id="cs-counted" type="number" min="0" step="0.01" value={counted}
                   onChange={(e) => setCounted(e.target.value)} autoFocus />
            <span className="fd-field-hint">
              Enter what the drawer actually holds. It is never corrected to match
              the expectation — the difference is the point.
            </span>

            {/* Live preview so the variance is not a surprise on submit. */}
            {counted !== '' && summary && (
              <div className="fd-close-preview">
                <Variance value={Number(counted) - Number(summary.ExpectedCash || 0)} />
              </div>
            )}

            <label htmlFor="cs-notes">Notes</label>
            <input id="cs-notes" type="text" maxLength={500} value={notes}
                   onChange={(e) => setNotes(e.target.value)}
                   placeholder="Explain any difference" />

            <div className="fd-variant-actions">
              <button className="fd-btn fd-btn-primary" onClick={doClose} disabled={closeBusy}>
                {closeBusy ? 'Closing…' : 'Close till'}
              </button>
              <button className="fd-btn fd-btn-outline" onClick={() => { setCloseTarget(null); setSummary(null) }}
                      disabled={closeBusy}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default CashSessions
