import React, { useEffect, useState } from 'react'
import posService from '../../services/posService'
import { OrderNoLink } from './OrderLinkProvider'
import { statusLabel } from '../../utils/posStatus'

const money = (n) => `₹${(Number(n) || 0).toFixed(2)}`
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
