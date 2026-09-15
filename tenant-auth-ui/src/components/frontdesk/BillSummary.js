import React, { useState } from 'react'
import { summarizeSession, billMoney as money } from '../../utils/posBilling'
import LineOptions from './LineOptions'
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
  const showTaxRows = hasItemGst || session.tax > 0 || session.taxByComponent.length > 0
  // A zero-rated menu still sells customised plates. Gating the item table on
  // GST alone would hide every option and add-on price on exactly those bills.
  const hasChoices = session.items.some((i) => {
    const l = i.line || {}
    const list = (v) => (Array.isArray(v) ? v.length : 0)
    return list(l.variants ?? l.Variants) + list(l.addons ?? l.Addons) > 0
  })

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
      {(hasItemGst || hasChoices) && (
        <div className="fd-bill-gst">
          <button
            type="button"
            className="fd-bill-gst-toggle"
            onClick={() => setShowBreakup((v) => !v)}
            aria-expanded={showBreakup}
          >
            {showBreakup ? '▾' : '▸'} {hasItemGst ? 'GST by item' : 'Items'}
          </button>
          {showBreakup && (
            <div className="fd-table-scroll">
              <table className="fd-bill-gst-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    {hasItemGst && <th>Taxable</th>}
                    {hasItemGst && <th>GST %</th>}
                    {hasItemGst && <th>GST</th>}
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {session.items.map((it, i) => (
                    <tr key={`${it.name}-${it.rate}-${i}`}>
                      <td>
                        {it.name}
                        <span className="fd-bill-gst-qty">×{it.qty}</span>
                        {it.isTaxIncluded && it.rate > 0 && <span className="tax-flag incl">incl.</span>}
                        {/* The options and add-ons with what each added, and
                            the per-plate build-up — otherwise a ₹219 dish
                            billed at ₹239 is a number the cashier cannot
                            defend to the guest. Notes stay on the KOT; a bill
                            is about money. */}
                        <LineOptions line={it.line} showBreakdown showNote={false} />
                      </td>
                      {hasItemGst && <td>₹{money(it.net)}</td>}
                      {/* The rate is the SUM of the group's components, which is
                          why a "GST 5%" group entered as CGST 5 + SGST 5 charges
                          10%. Showing the make-up alongside it turns that from an
                          unexplained number into a visible setup choice. */}
                      {hasItemGst && (
                        <td>
                          {it.rate ? `${it.rate}%` : '—'}
                          {it.rate > 0 && it.components?.length > 1 && (
                            <span className="fd-bill-gst-parts">
                              {it.components.map((c) => `${c.name} ${c.rate}`).join(' + ')}
                            </span>
                          )}
                        </td>
                      )}
                      {hasItemGst && <td>₹{money(it.tax)}</td>}
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
        {/* No tax on the bill — GST switched off, or every dish exempt: one
            Total, not a Subtotal and a ₹0.00 Tax row restating it. */}
        {showTaxRows && (
          <>
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
          </>
        )}
        <div className="fd-bill-row fd-bill-row-grand">
          <span>Grand Total</span>
          <span>₹{money(session.total)}</span>
        </div>
      </div>
    </div>
  )
}

export default BillSummary
