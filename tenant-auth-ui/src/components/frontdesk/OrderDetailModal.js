import React, { useEffect, useRef, useState } from 'react'
import useOrderDetail from '../../hooks/useOrderDetail'
import { useCan } from '../../hooks/useCan'
import { SCOPES } from '../../constants'
import BalanceBlock from './BalanceBlock'
import CollectFlow from './CollectFlow'
import { statusLabel, normalizeStatus } from '../../utils/posStatus'
import { itemLabel, itemQty } from '../../utils/posRounds'
import LineOptions, { OrderInstructions } from './LineOptions'

const money = (n) => (Number(n) || 0).toFixed(2)
const time = (v) => (v ? new Date(v).toLocaleString() : '—')

/**
 * One round, opened from anywhere its number appears.
 *
 * Presentational: it renders what useOrderDetail hands it and owns no fetching
 * of its own. The identity block leads, because the first question anyone
 * clicking an order number has is "whose order is this?" — a token number for a
 * counter customer, a table for a seated one.
 */
const OrderDetailModal = ({ orderId, onClose }) => {
  const { detail, loading, error, reload } = useOrderDetail(orderId)
  const closeRef = useRef(null)
  // Collecting a balance is taking money — the cashier's job as much as the
  // accountant's. Write-off is decided inside CollectFlow (admins only).
  const canCollect = useCan([SCOPES.POS_BILLING_WRITE, SCOPES.TRANSACTIONS_WRITE])
  const canWriteOff = useCan(SCOPES.TENANT_SUPER_ADMIN)
  const [collect, setCollect] = useState(null)

  // Escape closes, and focus lands on the dialog rather than staying behind it
  // on the list underneath.
  useEffect(() => {
    if (!orderId) return undefined
    // The Collect sheet handles its own Escape; this one must not close the
    // order underneath it at the same time.
    const onKey = (e) => { if (e.key === 'Escape' && !collect) onClose() }
    document.addEventListener('keydown', onKey)
    closeRef.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [orderId, onClose, collect])

  if (!orderId) return null

  const order = detail?.Order
  const source = detail?.Source
  const token = detail?.Token
  const bill = detail?.Bill
  const invoiced = !!bill?.TransactionDetailLogId
  const owing = invoiced && Number(bill.Due) > 0
  // While money is owed the first payment's time is not a settlement — it is
  // the last payment. Calling it "Settled" is what made a part-paid order look
  // finished.
  const lastPayment = (bill?.Payments || []).reduce(
    (latest, p) => (!latest || new Date(p.Timestamp) > new Date(latest) ? p.Timestamp : latest), null,
  )
  const openCollect = (how) => setCollect({
    how,
    doc: {
      Id: bill.TransactionDetailLogId,
      TransactionNo: bill.TransactionNo,
      GrossAmount: bill.InvoiceTotal,
      Paid: bill.Paid,
      Due: bill.Due,
      CustomerName: bill.CustomerName,
      BranchId: bill.BranchDetailId || order?.BranchDetailId,
      label: source?.label || null,
    },
  })

  return (
    <div className="fd-modal-overlay" onClick={onClose}>
      <div
        className="fd-modal fd-order-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Order ${order?.OrderNo || ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="fd-modal-header">
          <h3>{order?.OrderNo || 'Order'}</h3>
          <button className="fd-modal-close" onClick={onClose} ref={closeRef} aria-label="Close">✕</button>
        </div>

        {loading && <div className="fd-loading">Loading order…</div>}
        {error && <div className="fd-settle-warn" role="alert">{error}</div>}

        {order && (
          <>
            {/* Whose order this is. A counter customer is holding a NUMBER; a
                seated one is at a table. Saying which, in the same place every
                time, is the whole point of a shared detail view. */}
            <div className={`fd-order-identity is-${source?.kind || 'none'}`}>
              {source?.kind === 'token' && (
                <>
                  <span className="fd-order-identity-label">Token</span>
                  <strong className="fd-order-identity-value">{source.label}</strong>
                  <span className="fd-order-identity-sub">
                    Counter order · {statusLabel(token?.Status)}
                  </span>
                </>
              )}
              {source?.kind === 'table' && (
                <>
                  <span className="fd-order-identity-label">Table</span>
                  <strong className="fd-order-identity-value">{source.label}</strong>
                  <span className="fd-order-identity-sub">
                    {order.FloorName ? `${order.FloorName} · ` : ''}Dine-in
                  </span>
                </>
              )}
              {(!source || source.kind === 'none') && (
                <>
                  <span className="fd-order-identity-label">No token or table</span>
                  <strong className="fd-order-identity-value">{statusLabel(order.OrderType)}</strong>
                </>
              )}
            </div>

            <dl className="fd-order-meta">
              <div><dt>Type</dt><dd>{statusLabel(order.OrderType)}</dd></div>
              <div><dt>Status</dt><dd>{statusLabel(order.Status)}</dd></div>
              <div><dt>Placed</dt><dd>{time(order.CreatedOn)}</dd></div>
              {token && (
                <>
                  <div><dt>Called</dt><dd>{time(token.CalledAt)}</dd></div>
                  <div><dt>Handed over</dt><dd>{time(token.ServedAt)}</dd></div>
                </>
              )}
            </dl>

            <div className="fd-section-title">Items</div>
            {order.Items.length === 0 ? (
              <div className="fd-empty">No items on this round.</div>
            ) : (
              <div className="fd-table-scroll">
                <table className="fd-table fd-order-items">
                  <thead>
                    <tr><th>Item</th><th className="num">Qty</th><th className="num">Amount</th></tr>
                  </thead>
                  <tbody>
                    {order.Items.map((it, i) => (
                      <tr key={i}>
                        <td>
                          {itemLabel(it)}
                          {/* Options, add-ons and the kitchen note as ordered, and how the
                              rate was built from them. */}
                          <LineOptions line={it} showBreakdown />
                        </td>
                        <td className="num">{itemQty(it)}</td>
                        <td className="num">₹{money(it.grossAmount ?? it.price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <OrderInstructions
              instructions={order.CookingInstructions}
              noCutlery={order.NoCutlery}
            />

            <div className="fd-order-totals">
              <span>Subtotal ₹{money(order.SubTotal)}</span>
              <span>Tax ₹{money(order.TaxAmount)}</span>
              <strong>Total ₹{money(order.Total)}</strong>
            </div>

            {/* The kitchen and the ledger are where this round went next.
                Showing both closes the loop from "an order number" to "what
                happened to it". */}
            {detail.Kots?.length > 0 && (
              <>
                <div className="fd-section-title">Kitchen</div>
                <ul className="fd-order-kots">
                  {detail.Kots.map((k) => (
                    <li key={k.Id}>
                      <span className="kot-no">{k.KotNo}</span>
                      <span className={`fd-badge fd-badge-${normalizeStatus(k.Status) === 'ready' ? 'settled' : 'pending'}`}>
                        {statusLabel(k.Status)}
                      </span>
                      <span className="muted">{time(k.FiredAt)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <div className="fd-section-title">Billing</div>
            {bill ? (
              <>
                <dl className="fd-order-meta">
                  <div><dt>Bill</dt><dd>{bill.BillNo}</dd></div>
                  <div><dt>Invoice</dt><dd>{bill.TransactionNo || <span className="muted">Not posted</span>}</dd></div>
                  <div><dt>Status</dt><dd>{statusLabel(bill.LedgerStatus || bill.BillStatus)}</dd></div>
                  {owing ? (
                    <div><dt>Last payment</dt><dd>{time(lastPayment || bill.SettledAt)}</dd></div>
                  ) : (
                    <div><dt>Settled</dt><dd>{time(bill.InvoiceSettledAt || bill.SettledAt)}</dd></div>
                  )}
                  {bill.CustomerName && (
                    <div><dt>{owing ? 'Owed by' : 'Customer'}</dt><dd>{bill.CustomerName}{bill.CustomerMobile ? ` · ${bill.CustomerMobile}` : ''}</dd></div>
                  )}
                </dl>
                {invoiced && (
                  <BalanceBlock
                    total={bill.InvoiceTotal}
                    paid={bill.Paid}
                    due={bill.Due}
                    returned={bill.Returned}
                    writtenOff={bill.WrittenOff}
                    payments={bill.Payments}
                    onCollect={canCollect ? () => openCollect('collect') : undefined}
                    onWriteOff={canWriteOff ? () => openCollect('writeoff') : undefined}
                  />
                )}
              </>
            ) : (
              <div className="fd-empty">Not billed yet — this round is still open.</div>
            )}
          </>
        )}
      </div>
      {/* Outside the order dialog's click-stop so its backdrop works, and
          stopped here so a click in it never closes the order underneath. */}
      {collect && (
        <div onClick={(e) => e.stopPropagation()}>
          <CollectFlow
            doc={collect.doc}
            start={collect.how}
            onClose={() => setCollect(null)}
            onChanged={reload}
          />
        </div>
      )}
    </div>
  )
}

export default OrderDetailModal
