import React, { useState, useMemo } from 'react'

// Choosing what actually comes back.
//
// ── Why a picker rather than a Refund button ────────────────────────────────
// A customer sends back SOME of what they ordered — one dish from four, two of
// three naans. A single Refund button can only express "all of it", which is
// why the old flow reversed whole invoices and why "which dishes come back?"
// had no answer at any granularity.
//
// ── The rule this component enforces ────────────────────────────────────────
// You can never select more than is left. The server refuses it too — that is
// where the guarantee lives, under a row lock — but a screen that lets somebody
// build an invalid basket and only says so on submit is a screen that wastes
// their time at a counter with a queue behind them.

const money = (n) => (Number(n) || 0).toFixed(2)

const ReturnPicker = ({ document: doc, reasons = [], busy, onCancel, onConfirm }) => {
  // lineId → quantity. Absent means "not coming back", which is the default:
  // a return starts empty and the operator picks, rather than starting full and
  // making them deselect.
  const [picked, setPicked] = useState({})
  const [reasonId, setReasonId] = useState('')
  const [note, setNote] = useState('')
  const [destination, setDestination] = useState('ORIGINAL')

  const lines = doc?.Lines || []

  // What is still available on each line: sold minus everything previous
  // returns already took.
  const remainingOf = (l) => Math.max(
    0,
    Number(l.Quantity || 0) - Number(l.ReturnedQty || 0),
  )

  const setQty = (line, qty) => {
    const capped = Math.max(0, Math.min(Number(qty) || 0, remainingOf(line)))
    setPicked((prev) => {
      const next = { ...prev }
      if (capped <= 0) delete next[line.Id]
      else next[line.Id] = capped
      return next
    })
  }

  // The live refund total, priced the way the server prices it: a proportional
  // share of what the original line carried. Shown so nobody has to submit to
  // find out what the customer gets back.
  const total = useMemo(() => lines.reduce((sum, l) => {
    const qty = picked[l.Id] || 0
    if (qty <= 0) return sum
    const sold = Number(l.Quantity) || 0
    if (sold <= 0) return sum
    return sum + (Number(l.GrossAmount || 0) * qty) / sold
  }, 0), [lines, picked])

  const selectedCount = Object.keys(picked).length
  const anythingLeft = lines.some((l) => remainingOf(l) > 0)

  const selectAllRemaining = () => {
    const next = {}
    lines.forEach((l) => {
      const left = remainingOf(l)
      if (left > 0) next[l.Id] = left
    })
    setPicked(next)
  }

  if (!doc) return null

  return (
    <div
      className="fd-modal-backdrop fd-return-picker-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Return items"
    >
      <div className="fd-return-picker">
        <div className="fd-return-head">
          <h3>Return against {doc.TransactionNo}</h3>
          <p className="muted">
            Pick what is coming back. The invoice keeps its original total —
            a credit note is raised beside it.
          </p>
        </div>

        {!anythingLeft ? (
          <div className="fd-empty">Every line on this invoice has already been returned.</div>
        ) : (
          <>
            <div className="fd-table-scroll">
              <table className="fd-invoice-lines">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th className="num">Sold</th>
                    <th className="num">Already back</th>
                    <th className="num">Return</th>
                    <th className="num">Refund</th>
                    <th>Restock</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => {
                    const left = remainingOf(l)
                    const qty = picked[l.Id] || 0
                    const sold = Number(l.Quantity) || 0
                    const refund = sold > 0 ? (Number(l.GrossAmount || 0) * qty) / sold : 0
                    return (
                      <tr key={l.Id} className={left === 0 ? 'is-exhausted' : undefined}>
                        <td>{l.ItemName || l.Comment || l.ItemId}</td>
                        <td className="num">{sold}</td>
                        <td className="num">
                          {Number(l.ReturnedQty) > 0
                            ? <span className="fd-returned-amount">{Number(l.ReturnedQty)}</span>
                            : <span className="muted">—</span>}
                        </td>
                        <td className="num">
                          <input
                            type="number"
                            min={0}
                            max={left}
                            step="any"
                            value={qty || ''}
                            disabled={left === 0 || busy}
                            aria-label={`Quantity to return of ${l.ItemName || l.Comment || 'item'}`}
                            onChange={(e) => setQty(l, e.target.value)}
                            className="fd-return-qty"
                          />
                          {left === 0 && <div className="muted small">all returned</div>}
                        </td>
                        <td className="num">
                          {qty > 0 ? `₹${money(refund)}` : <span className="muted">—</span>}
                        </td>
                        <td>
                          {/* Intent only — there is no stock ledger, so nothing
                              is decremented. Recorded so the data exists on the
                              day one lands. */}
                          <label className="fd-restock-label">
                            <input type="checkbox" disabled={qty <= 0 || busy} />
                            <span className="muted small">back to stock</span>
                          </label>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="fd-return-controls">
              <button
                type="button"
                className="fd-btn fd-btn-outline"
                onClick={selectAllRemaining}
                disabled={busy}
              >
                Return everything left
              </button>

              <label htmlFor="return-reason">Reason</label>
              <select
                id="return-reason"
                value={reasonId}
                onChange={(e) => setReasonId(e.target.value)}
                disabled={busy}
              >
                <option value="">Choose a reason…</option>
                {reasons.map((r) => (
                  <option key={r.Id || r.id} value={r.Id || r.id}>{r.Name}</option>
                ))}
              </select>

              <label htmlFor="return-dest">Refund to</label>
              <select
                id="return-dest"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                disabled={busy}
              >
                <option value="ORIGINAL">The original payment</option>
                <option value="STORE_CREDIT">Store credit</option>
              </select>

              <input
                type="text"
                value={note}
                maxLength={500}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Note (optional)"
                disabled={busy}
                className="fd-return-note"
                aria-label="Note"
              />
            </div>

            <div className="fd-return-foot">
              <div className="fd-return-total">
                <span>Refund total</span>
                <strong>₹{money(total)}</strong>
                <span className="muted small">
                  of ₹{money(doc.GrossAmount)} invoiced
                </span>
              </div>
              <div className="fd-return-actions">
                <button type="button" className="fd-btn fd-btn-outline" onClick={onCancel} disabled={busy}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="fd-btn fd-btn-danger"
                  // Nothing selected is not a return. A reason is required
                  // because the report that groups them is the whole point of
                  // having a taxonomy.
                  disabled={selectedCount === 0 || !reasonId || busy}
                  onClick={() => onConfirm?.({
                    lines: Object.entries(picked).map(([lineId, quantity]) => ({
                      lineId, quantity,
                    })),
                    reasonId,
                    note: note || undefined,
                    destination,
                  })}
                >
                  {busy ? 'Recording…' : `Return ₹${money(total)}`}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default ReturnPicker
