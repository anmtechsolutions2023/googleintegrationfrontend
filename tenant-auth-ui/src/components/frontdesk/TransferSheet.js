import React, { useMemo, useState, useEffect } from 'react'
import TableSelect, { tableStatusMeta } from './TableSelect'
import { summarizeRound, summarizeSession, billMoney as money } from '../../utils/posBilling'
import './frontdesk.css'

// Simple order transfer: pick a whole round (a complete order) — or the entire
// table — and move it to a FREE table. Prices/GST are untouched ("keep as
// served"); on confirm the server frees the source and occupies the destination.
const TransferSheet = ({
  open, onClose, onConfirm, busy = false,
  sourceTableId, sourceTableLabel, rounds = [], activeOrderId,
  tables = [], floors = [],
}) => {
  const [pick, setPick] = useState(null)   // orderId | '__ALL__'
  const [toTableId, setToTableId] = useState('')

  useEffect(() => {
    if (!open) return
    const initial = activeOrderId || (rounds.length ? rounds[rounds.length - 1].orderId : null)
    setPick(initial)
    setToTableId('')
  }, [open, activeOrderId, rounds])

  // Only free tables can receive an order, and never the source itself.
  const freeTables = useMemo(
    () => tables.filter(
      (t) => (t.id || t.Id) !== sourceTableId && tableStatusMeta(t).key === 'free',
    ),
    [tables, sourceTableId],
  )

  const destLabel = useMemo(() => {
    const t = tables.find((x) => (x.id || x.Id) === toTableId)
    if (!t) return ''
    const floor = floors.find((f) => (f.id || f.Id) === t.FloorId)
    return `${floor ? `${floor.Name || floor.name} - ` : ''}${t.Name || t.name}`
  }, [toTableId, tables, floors])

  const movingTotal = useMemo(() => {
    if (pick === '__ALL__') return summarizeSession(rounds).total
    const r = rounds.find((x) => x.orderId === pick)
    return r ? summarizeRound(r).total : 0
  }, [pick, rounds])

  const canConfirm = !!toTableId && !!pick

  const buildPayload = () => (
    pick === '__ALL__'
      ? { scope: 'orders', orderIds: rounds.map((r) => r.orderId), toTableId }
      : { scope: 'orders', orderIds: [pick], toTableId }
  )

  if (!open) return null

  return (
    <div className="fd-modal-backdrop" role="dialog" aria-label="Transfer order to another table">
      <div className="fd-transfer-sheet">
        <div className="fd-transfer-head">
          <h3>Transfer order</h3>
          <button className="fd-transfer-x" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="fd-transfer-panes">
          {/* ── What to move ── */}
          <div className="fd-transfer-pane">
            <div className="fd-transfer-panehead">
              <span className="fd-transfer-panelabel">From</span>
              <span className="fd-transfer-tabletag src">{sourceTableLabel}</span>
            </div>

            <div className="fd-transfer-panelabel" style={{ marginBottom: 8 }}>Choose what to transfer</div>
            <div className="fd-transfer-opts" role="radiogroup" aria-label="Order to transfer">
              {rounds.map((r) => {
                const total = summarizeRound(r).total
                return (
                  <label key={r.orderId} className={`fd-transfer-opt ${pick === r.orderId ? 'on' : ''}`}>
                    <input
                      type="radio" name="transfer-pick"
                      checked={pick === r.orderId}
                      onChange={() => setPick(r.orderId)}
                    />
                    <span className="fd-transfer-optbody">
                      <span className="nm">Round {r.round}{r.orderNo ? ` — ${r.orderNo}` : ''}</span>
                      <span className="meta">{(r.items || []).length} item{(r.items || []).length !== 1 ? 's' : ''}</span>
                    </span>
                    <span className="fd-transfer-optamt">₹{money(total)}</span>
                  </label>
                )
              })}

              {rounds.length > 1 && (
                <label className={`fd-transfer-opt whole ${pick === '__ALL__' ? 'on' : ''}`}>
                  <input
                    type="radio" name="transfer-pick"
                    checked={pick === '__ALL__'}
                    onChange={() => setPick('__ALL__')}
                  />
                  <span className="fd-transfer-optbody">
                    <span className="nm">Entire table</span>
                    <span className="meta">all {rounds.length} rounds</span>
                  </span>
                  <span className="fd-transfer-optamt">₹{money(summarizeSession(rounds).total)}</span>
                </label>
              )}
            </div>
          </div>

          {/* ── Destination (free tables only) ── */}
          <div className="fd-transfer-pane">
            <div className="fd-transfer-panehead">
              <span className="fd-transfer-panelabel">To (free tables)</span>
              <span className={`fd-transfer-tabletag ${toTableId ? 'dest' : 'muted'}`}>
                {destLabel || 'pick a table'}
              </span>
            </div>

            {freeTables.length === 0 ? (
              <div className="fd-empty" style={{ padding: '10px 0' }}>
                No free tables available. Free a table before transferring.
              </div>
            ) : (
              <TableSelect
                tables={freeTables}
                floors={floors}
                value={toTableId}
                onChange={setToTableId}
                placeholder="— Destination table —"
              />
            )}

            <p className="fd-transfer-note" style={{ marginTop: 12 }}>
              Prices &amp; GST stay as served. The source table is freed and the
              destination becomes occupied.
            </p>
          </div>
        </div>

        <div className="fd-transfer-foot">
          <span className="fd-transfer-footsum">
            {canConfirm
              ? <>Transferring <b>₹{money(movingTotal)}</b> → {destLabel}</>
              : 'Choose an order and a free destination table'}
          </span>
          <span style={{ display: 'flex', gap: 8 }}>
            <button className="fd-btn fd-btn-outline" onClick={onClose} disabled={busy}>Cancel</button>
            <button
              className="fd-btn fd-btn-primary"
              disabled={!canConfirm || busy}
              onClick={() => onConfirm(buildPayload())}
            >
              {busy ? 'Moving…' : (destLabel ? `Move to ${destLabel}` : 'Move')}
            </button>
          </span>
        </div>
      </div>
    </div>
  )
}

export default TransferSheet
