import React, { useState } from 'react'
import { summarizeSession, billMoney as money } from '../../utils/posBilling'
import './frontdesk.css'

// Whole-session bill: a per-round line, an optional item-wise GST breakdown
// (which product carries how much tax), the CGST/SGST footer, and the grand
// total. Purely presentational — numbers come from summarizeSession(), which
// reads the priced snapshot the server already stored on each round.
const BillSummary = ({ rounds, title = 'Bill Summary', defaultOpenBreakup = false }) => {
  const [showBreakup, setShowBreakup] = useState(defaultOpenBreakup)
  if (!rounds || rounds.length === 0) return null

  const session = summarizeSession(rounds)
  const multiRound = session.rounds.length > 1
  const hasItemGst = session.items.some((i) => i.rate > 0)

  return (
    <div className="fd-bill-summary">
      <div className="fd-bill-summary-title">{title}</div>

      {/* Per-round subtotals — only meaningful once there are several rounds. */}
      {multiRound && (
        <div className="fd-bill-rounds">
          {session.rounds.map((r) => (
            <div className="fd-bill-round-row" key={r.orderId || r.round}>
              <span>
                <span className="fd-bill-round-tag">Round {r.round}</span>
                {r.orderNo ? <span className="fd-bill-round-no">{r.orderNo}</span> : null}
              </span>
              <span>₹{money(r.total)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Item-wise GST — collapsible so it doesn't crowd the till, but one tap
          away when a mixed-tax order needs explaining. */}
      {hasItemGst && (
        <div className="fd-bill-gst">
          <button
            type="button"
            className="fd-bill-gst-toggle"
            onClick={() => setShowBreakup((v) => !v)}
            aria-expanded={showBreakup}
          >
            {showBreakup ? '▾' : '▸'} GST by item
          </button>
          {showBreakup && (
            <div className="fd-table-scroll">
              <table className="fd-bill-gst-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Taxable</th>
                    <th>GST %</th>
                    <th>GST</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {session.items.map((it, i) => (
                    <tr key={`${it.name}-${it.rate}-${i}`}>
                      <td>
                        {it.name}
                        <span className="fd-bill-gst-qty">×{it.qty}</span>
                        {it.isTaxIncluded && <span className="tax-flag incl">incl.</span>}
                      </td>
                      <td>₹{money(it.net)}</td>
                      {/* The rate is the SUM of the group's components, which is
                          why a "GST 5%" group entered as CGST 5 + SGST 5 charges
                          10%. Showing the make-up alongside it turns that from an
                          unexplained number into a visible setup choice. */}
                      <td>
                        {it.rate ? `${it.rate}%` : '—'}
                        {it.rate > 0 && it.components?.length > 1 && (
                          <span className="fd-bill-gst-parts">
                            {it.components.map((c) => `${c.name} ${c.rate}`).join(' + ')}
                          </span>
                        )}
                      </td>
                      <td>₹{money(it.tax)}</td>
                      <td>₹{money(it.gross)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Grand total with the CGST/SGST footer that sums to Tax. */}
      <div className="fd-bill-totals">
        <div className="fd-bill-row">
          <span>Subtotal</span>
          <span>₹{money(session.subTotal)}</span>
        </div>
        {session.taxByComponent.map((c) => (
          <div className="fd-bill-row fd-bill-row-sub" key={c.name}>
            <span>{c.name}{c.rate ? ` @ ${c.rate}%` : ''}</span>
            <span>₹{money(c.amount)}</span>
          </div>
        ))}
        <div className="fd-bill-row">
          <span>Tax</span>
          <span>₹{money(session.tax)}</span>
        </div>
        <div className="fd-bill-row fd-bill-row-grand">
          <span>Grand Total</span>
          <span>₹{money(session.total)}</span>
        </div>
      </div>
    </div>
  )
}

export default BillSummary
