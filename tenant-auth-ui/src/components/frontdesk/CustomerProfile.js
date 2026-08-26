import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import posService from '../../services/posService'
import { OrderNoLink } from './OrderLinkProvider'
import { statusLabel } from '../../utils/posStatus'
import useCan from '../../hooks/useCan'
import { SCOPES } from '../../constants'

const money = (n) => `₹${(Number(n) || 0).toFixed(2)}`

// The stored vocabulary in the words a manager uses. REVERSAL in particular
// needs saying plainly: it is what a refund does to points.
const ENTRY_LABEL = {
  EARN: 'Earned on a sale',
  REVERSAL: 'Taken back — sale refunded',
  REDEEM: 'Redeemed against a bill',
  ADJUSTMENT: 'Adjusted by hand',
  EXPIRY: 'Expired',
}
const when = (v) => (v ? new Date(v).toLocaleDateString() : '—')

const Stars = ({ rating }) => (
  <span className="fd-stars" aria-label={`${rating} out of 5`}>
    {'★'.repeat(Number(rating) || 0)}{'☆'.repeat(Math.max(0, 5 - (Number(rating) || 0)))}
  </span>
)

/**
 * One customer, and everything they have done here.
 *
 * The CRM screen listed names, phone numbers and three counters that read zero
 * for everybody, because nothing ever wrote them and no order was ever attached
 * to a customer. This is what those columns are FOR: what they order, how often
 * they come, and what they said about it.
 *
 * Order numbers are rendered with the shared OrderNoLink, so opening one here
 * shows the same view as opening it from the ledger or the dashboard.
 */
const CustomerProfile = ({ customerId, onClose }) => {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [statement, setStatement] = useState(null)
  const [adjusting, setAdjusting] = useState(false)
  const [points, setPoints] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  // Reading a balance at the counter and creating one are different
  // permissions. The server refuses either way; this only hides the form.
  const canAdjust = useCan(SCOPES.POS_CRM_WRITE)

  const loadStatement = useCallback(() => {
    if (!customerId) return
    posService.getLoyaltyStatement(customerId)
      .then(setStatement)
      // The points panel decorates this profile; losing it must not take the
      // order history with it, so it fails to an explanation in its own place.
      .catch(() => setStatement({ error: true }))
  }, [customerId])

  useEffect(() => {
    if (!customerId) { setData(null); return undefined }
    let cancelled = false
    setLoading(true)
    setError(null)
    posService.getCustomerProfile(customerId)
      .then((d) => { if (!cancelled) setData(d) })
      .catch((e) => {
        if (!cancelled) setError(e?.response?.data?.message || 'Could not load this customer')
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [customerId])

  useEffect(() => {
    setStatement(null)
    setAdjusting(false)
    setPoints('')
    setReason('')
    loadStatement()
  }, [customerId, loadStatement])

  const submitAdjustment = async (e) => {
    e.preventDefault()
    const value = Number(points)
    if (!Number.isInteger(value) || value === 0) {
      toast.error('Enter a whole number of points, positive to grant or negative to take back')
      return
    }
    if (!reason.trim()) {
      toast.error('Say why — an unexplained adjustment is the one an auditor asks about')
      return
    }
    setSaving(true)
    try {
      const result = await posService.adjustLoyalty(customerId, { Points: value, Reason: reason.trim() })
      toast.success(`${value > 0 ? 'Granted' : 'Deducted'} ${Math.abs(value)} points · balance ${result.balance}`)
      setAdjusting(false)
      setPoints('')
      setReason('')
      loadStatement()
      // The header counter is a cache of the ledger; refresh it rather than
      // letting the two disagree on screen.
      posService.getCustomerProfile(customerId).then(setData).catch(() => {})
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not adjust these points')
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (!customerId) return undefined
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [customerId, onClose])

  if (!customerId) return null

  const c = data?.Customer
  const s = data?.Summary

  return (
    <div className="fd-modal-overlay" onClick={onClose}>
      <div
        className="fd-modal fd-customer-profile"
        role="dialog"
        aria-modal="true"
        aria-label={`Customer ${c?.Name || ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="fd-modal-header">
          <h3>{c?.Name || 'Customer'}</h3>
          <button className="fd-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {loading && <div className="fd-loading">Loading customer…</div>}
        {error && <div className="fd-settle-warn" role="alert">{error}</div>}

        {c && (
          <>
            <div className="fd-customer-meta">
              {c.Phone && <span>📞 {c.Phone}</span>}
              {c.Email && <span>✉️ {c.Email}</span>}
              <span>Last visit {when(c.LastVisitAt)}</span>
            </div>

            <div className="fd-kpi-grid">
              <div className="fd-kpi-card accent-blue">
                <span className="kpi-label">Visits</span>
                <span className="kpi-value">{c.Visits}</span>
              </div>
              <div className="fd-kpi-card accent-green">
                <span className="kpi-label">Total spent</span>
                <span className="kpi-value">{money(c.TotalSpent)}</span>
              </div>
              <div className="fd-kpi-card accent-orange">
                <span className="kpi-label">Loyalty points</span>
                <span className="kpi-value">{c.LoyaltyPoints}</span>
              </div>
              <div className="fd-kpi-card">
                <span className="kpi-label">Average order</span>
                <span className="kpi-value">{money(s?.AverageOrderValue)}</span>
                {s?.AverageRating != null && (
                  <span className="kpi-hint">Rated {s.AverageRating} / 5</span>
                )}
              </div>
            </div>

            <div className="fd-section-title">Order history</div>
            {data.Orders.length === 0 ? (
              <div className="fd-empty">
                No orders yet. Attach this customer on the Billing screen when
                they next order.
              </div>
            ) : (
              <div className="fd-table-scroll">
                <table className="fd-table">
                  <thead>
                    <tr>
                      <th>Order</th><th>Token / Table</th><th>When</th>
                      <th>Invoice</th><th className="num">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.Orders.map((o) => (
                      <tr key={o.OrderId}>
                        <td><OrderNoLink orderId={o.OrderId}>{o.OrderNo}</OrderNoLink></td>
                        <td>
                          {o.TokenLabel ? (
                            <span className="fd-source-chip is-token">🎫 {o.TokenLabel}</span>
                          ) : o.TableName ? (
                            <span className="fd-source-chip is-table">🪑 {o.TableName}</span>
                          ) : <span className="muted">—</span>}
                        </td>
                        <td>{when(o.CreatedOn)}</td>
                        <td>
                          {o.TransactionNo || <span className="muted">{statusLabel(o.Status)}</span>}
                        </td>
                        <td className="num strong">{money(o.Total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="fd-section-title">
              Loyalty points
              {canAdjust && !adjusting && (
                <button
                  type="button"
                  className="fd-btn fd-btn-outline fd-btn-sm"
                  style={{ marginLeft: 12 }}
                  onClick={() => setAdjusting(true)}
                >
                  Adjust
                </button>
              )}
            </div>

            {canAdjust && adjusting && (
              <form className="fd-loyalty-adjust" onSubmit={submitAdjustment}>
                <label>
                  Points
                  <input
                    type="number"
                    value={points}
                    onChange={(e) => setPoints(e.target.value)}
                    placeholder="50, or −20 to take back"
                    autoFocus
                  />
                </label>
                <label className="grow">
                  Reason
                  <input
                    type="text"
                    value={reason}
                    maxLength={255}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Goodwill — delayed order"
                  />
                </label>
                <div className="fd-loyalty-adjust-actions">
                  <button type="submit" className="fd-btn fd-btn-primary" disabled={saving}>
                    {saving ? 'Saving…' : 'Apply'}
                  </button>
                  <button
                    type="button"
                    className="fd-btn fd-btn-outline"
                    onClick={() => setAdjusting(false)}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {statement?.error ? (
              <div className="fd-empty">Could not load the points history.</div>
            ) : !statement ? (
              <div className="fd-loading">Loading points…</div>
            ) : statement.entries.length === 0 ? (
              <div className="fd-empty">
                No points yet. They are earned automatically when a bill with this
                customer attached is settled.
              </div>
            ) : (
              <div className="fd-table-scroll">
                <table className="fd-table">
                  <thead>
                    <tr>
                      <th>When</th><th>What</th><th>Why</th><th className="num">Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statement.entries.map((e) => (
                      <tr key={e.Id}>
                        <td>{when(e.CreatedOn)}</td>
                        <td>{ENTRY_LABEL[e.EntryType] || e.EntryType}</td>
                        <td>{e.Reason || <span className="muted">—</span>}</td>
                        {/* Signed, and shown signed: the ledger records the
                            movement, not its magnitude. */}
                        <td className={`num strong ${Number(e.Points) < 0 ? 'is-negative' : ''}`}>
                          {Number(e.Points) > 0 ? `+${e.Points}` : e.Points}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={3} className="strong">Balance</td>
                      <td className="num strong">{statement.balance}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            <div className="fd-section-title">What they said</div>
            {data.Feedback.length === 0 ? (
              <div className="fd-empty">No feedback from this customer yet.</div>
            ) : (
              <ul className="fd-customer-feedback">
                {data.Feedback.map((f) => (
                  <li key={f.Id}>
                    <Stars rating={f.Rating} />
                    {f.Comments && <span className="comment">“{f.Comments}”</span>}
                    <span className="muted small">
                      {f.OrderNo ? `on ${f.OrderNo}` : 'no order linked'} · {when(f.CreatedOn)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default CustomerProfile
