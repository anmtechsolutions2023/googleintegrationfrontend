import React from 'react'
import './collect.css'

const money = (n) => (Number(n) || 0).toFixed(2)
const when = (v) => (v ? new Date(v).toLocaleString([], {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
}) : '')

/**
 * Paid, owed, and every payment behind them — one block for the ledger drawer
 * and the order detail, so both say the same thing about the same invoice.
 *
 * The progress bar runs against what the customer still has to pay for (the
 * total less anything returned), so a part-paid sale with a returned dish does
 * not look further from paid than it is.
 *
 * Presentational: it shows the actions it is given and decides nothing about
 * who may use them.
 *
 * @param {Object} props
 * @param {number} props.total     - Invoice total as issued.
 * @param {number} props.paid      - Everything collected against it.
 * @param {number} props.due       - Still owed (server-derived).
 * @param {number} [props.returned]
 * @param {number} [props.writtenOff]
 * @param {string} [props.writeOffNote] - "Customer left without paying · 04/10 13:12"
 * @param {Array}  [props.payments] - [{ PaymentMode, Amount, Timestamp, RefNo, CreatedBy }]
 * @param {Function} [props.onCollect]
 * @param {Function} [props.onWriteOff]
 * @param {React.ReactNode} [props.extraActions]
 */
const BalanceBlock = ({
  total, paid, due, returned = 0, writtenOff = 0, writeOffNote,
  payments = [], onCollect, onWriteOff, extraActions,
}) => {
  const owedFor = Math.max(0, (Number(total) || 0) - (Number(returned) || 0))
  const covered = Math.min(owedFor, (Number(paid) || 0) + (Number(writtenOff) || 0))
  const pct = owedFor > 0 ? Math.min(100, Math.round((covered / owedFor) * 1000) / 10) : 100
  const isDue = Number(due) > 0
  const rows = (payments || []).filter((p) => Number(p.Amount) > 0)

  return (
    <div className="fd-balance">
      <div className="fd-balance-top">
        <span><strong>₹{money(paid)}</strong> paid of ₹{money(total)}</span>
        {isDue
          ? <span className="fd-balance-due">₹{money(due)} due</span>
          : <span className="fd-balance-done">{Number(writtenOff) > 0 ? 'Closed' : 'Paid in full'}</span>}
      </div>
      <div
        className="fd-balance-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100}
        aria-valuenow={pct} aria-label={`${pct}% paid`}
      >
        <span style={{ width: `${pct}%` }} />
      </div>
      {rows.length > 0 && (
        <ul className="fd-balance-payments">
          {rows.map((p, i) => (
            <li key={p.Id || i}>
              <span className="fd-balance-mode">{p.PaymentMode || p.AccountName || 'Payment'}</span>
              <span className="fd-balance-when">
                {[when(p.Timestamp), p.RefNo ? `ref ${p.RefNo}` : null, p.CreatedBy].filter(Boolean).join(' · ')}
              </span>
              <b>₹{money(p.Amount)}</b>
            </li>
          ))}
        </ul>
      )}
      {Number(returned) > 0 && (
        <div className="fd-collect-hint">₹{money(returned)} returned — taken off what is owed first.</div>
      )}
      {Number(writtenOff) > 0 && (
        <div className="fd-balance-writeoff">
          ₹{money(writtenOff)} written off{writeOffNote ? ` · ${writeOffNote}` : ''}
        </div>
      )}
      {(isDue && (onCollect || onWriteOff)) || extraActions ? (
        <div className="fd-balance-actions">
          {isDue && onCollect && (
            <button type="button" className="fd-btn fd-btn-success" onClick={onCollect}>
              Collect ₹{money(due)}
            </button>
          )}
          {extraActions}
          {isDue && onWriteOff && (
            <button type="button" className="fd-btn fd-btn-outline" onClick={onWriteOff}>
              Write off
            </button>
          )}
        </div>
      ) : null}
    </div>
  )
}

export default BalanceBlock
