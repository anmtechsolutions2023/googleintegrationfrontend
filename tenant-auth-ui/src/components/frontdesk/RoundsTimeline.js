import React from 'react'
import { itemLabel, itemQty, itemVariants, formatRoundTime } from '../../utils/posRounds'
import { summarizeRound } from '../../utils/posBilling'
import './frontdesk.css'

const money = (n) => (Number(n) || 0).toFixed(2)

// Per-line amount + effective GST, read from the order's priced snapshot.
const lineGross = (it) =>
  it?.grossAmount != null ? Number(it.grossAmount) : Number(it?.price || it?.Price || 0) * itemQty(it)
const lineTaxRate = (it) => Number(it?.taxPct ?? it?.effectiveRate ?? 0)
const lineTaxAmount = (it) => Number(it?.taxAmount ?? 0)

// Presentational: renders a table's active orders grouped chronologically by
// round, with a timeline divider between sequential rounds. Shared by the
// Tables, KDS and Billing screens for identical sequencing.
//
// `showPricing` (Billing only) additionally reveals each line's amount + GST and
// a per-round total, so a multi-round bill is legible at a glance. It is off by
// default so the Tables/KDS views are unchanged.
//
// `onDeleteRound` (Billing only) surfaces, in each round header, the round's KOT
// status and a Delete button — right where its number and order number are
// shown. A round is only deletable while the kitchen hasn't started it: it never
// fired, or its KOT is still 'pending'. Once the KOT is ready/served the delete
// is hidden and replaced with an "In kitchen" marker.
const isRoundFired = (r) => /fired/i.test(String(r?.status || ''))

// `highlightOrderId` (KDS) marks the round the clicked ticket belongs to. A
// table with three rounds shows three tiles, and every one of them opened the
// same three-round list — with nothing saying which round you had tapped.
const RoundsTimeline = ({
  rounds, emptyMessage = 'No active orders for this table.',
  showPricing = false, onDeleteRound = null, kotStatusByOrder = {},
  highlightOrderId = null,
}) => {
  if (!rounds || rounds.length === 0) {
    return <div className="fd-empty">{emptyMessage}</div>
  }

  return (
    <div className="fd-rounds">
      {rounds.map((r, idx) => {
        const summary = showPricing ? summarizeRound(r) : null
        const kotStatus = kotStatusByOrder[r.orderId]         // 'pending'|'ready'|… | undefined
        const hasKot = !!kotStatus
        // Deletable while nothing is cooking: not fired, or KOT still pending.
        const deletable = !hasKot || kotStatus === 'pending'
        const kotLabel = hasKot ? `KOT · ${kotStatus}` : (isRoundFired(r) ? 'KOT fired' : null)
        const highlighted = !!highlightOrderId && r.orderId === highlightOrderId
        return (
          <div key={r.orderId || idx} className={`fd-round${highlighted ? ' is-highlighted' : ''}`}>
            <div className="fd-round-header">
              <span className="fd-round-badge">Round {r.round}</span>
              <span className="fd-round-orderno">{r.orderNo || `Order #${r.round}`}</span>
              {highlighted && <span className="fd-round-thisticket">this ticket</span>}
              {onDeleteRound && kotLabel && (
                <span className={`fd-round-kot ${hasKot && !deletable ? 'busy' : ''}`}>{kotLabel}</span>
              )}
              <span className="fd-round-headright">
                {r.time && <span className="fd-round-time">{formatRoundTime(r.time)}</span>}
                {onDeleteRound && (
                  deletable ? (
                    <button
                      type="button"
                      className="fd-round-del"
                      onClick={() => onDeleteRound(r)}
                      aria-label={`Delete round ${r.round}`}
                    >
                      Delete
                    </button>
                  ) : (
                    <span
                      className="fd-round-nodel"
                      title="The kitchen has started this round — it can't be deleted."
                    >
                      In kitchen
                    </span>
                  )
                )}
              </span>
            </div>
            <ul className="fd-round-items">
              {r.items.length === 0 ? (
                <li className="fd-round-empty">No item details</li>
              ) : (
                r.items.map((it, i) => {
                  const variants = itemVariants(it)
                  const rate = lineTaxRate(it)
                  return (
                    <li key={i}>
                      <div className="fd-round-item-main">
                        <span className="fd-round-qty">{itemQty(it)}x</span> {itemLabel(it)}
                        {/* Whether this line's price already includes tax — the
                            same colour language as the menu and cart. */}
                        {it?.isTaxIncluded && <span className="tax-flag incl">incl. tax</span>}
                        {/* GST tag + line amount so a multi-round bill reads
                            clearly which product carries how much tax. */}
                        {showPricing && rate > 0 && (
                          <span className="fd-round-gst" title={`GST ${rate}% = ₹${money(lineTaxAmount(it))}`}>
                            GST {rate}%
                          </span>
                        )}
                        {showPricing && (
                          <span className="fd-round-line-amt">₹{money(lineGross(it))}</span>
                        )}
                      </div>
                      {/* Options chosen when the round was placed, so a repeat
                          order or a reprint shows exactly what was served. */}
                      {variants.length > 0 && (
                        <div className="fd-round-variants">
                          {variants.map((v, vi) => (
                            <span className="ci-variant-chip" key={v.id || vi}>
                              {v.name}{Number(v.price) > 0 ? ` +₹${money(v.price)}` : ''}
                            </span>
                          ))}
                        </div>
                      )}
                    </li>
                  )
                })
              )}
            </ul>
            {summary && (
              <div className="fd-round-subtotal">
                <span>Round {r.round} total</span>
                <span>₹{money(summary.total)}</span>
              </div>
            )}
            {idx < rounds.length - 1 && <div className="fd-round-divider" aria-hidden="true" />}
          </div>
        )
      })}
    </div>
  )
}

export default RoundsTimeline
