import React from 'react'
import { itemLabel, itemQty, formatRoundTime } from '../../utils/posRounds'
import './frontdesk.css'

// Presentational: renders a table's active orders grouped chronologically by
// round, with a timeline divider between sequential rounds. Shared by the
// Tables, KDS and Billing screens for identical sequencing.
const RoundsTimeline = ({ rounds, emptyMessage = 'No active orders for this table.' }) => {
  if (!rounds || rounds.length === 0) {
    return <div className="fd-empty">{emptyMessage}</div>
  }

  return (
    <div className="fd-rounds">
      {rounds.map((r, idx) => (
        <div key={r.orderId || idx} className="fd-round">
          <div className="fd-round-header">
            <span className="fd-round-badge">Round {r.round}</span>
            <span className="fd-round-orderno">{r.orderNo || `Order #${r.round}`}</span>
            {r.time && <span className="fd-round-time">{formatRoundTime(r.time)}</span>}
          </div>
          <ul className="fd-round-items">
            {r.items.length === 0 ? (
              <li className="fd-round-empty">No item details</li>
            ) : (
              r.items.map((it, i) => (
                <li key={i}>
                  <span className="fd-round-qty">{itemQty(it)}x</span> {itemLabel(it)}
                </li>
              ))
            )}
          </ul>
          {idx < rounds.length - 1 && <div className="fd-round-divider" aria-hidden="true" />}
        </div>
      ))}
    </div>
  )
}

export default RoundsTimeline
