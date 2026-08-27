import React, { useEffect, useState, useCallback } from 'react'
import { toast } from 'react-toastify'
import posService from '../../services/posService'
import { OrderNoLink } from '../../components/frontdesk/OrderLinkProvider'
import { SCOPES } from '../../constants'
import { useCan } from '../../hooks/useCan'
import ReturnPicker from '../../components/frontdesk/ReturnPicker'
import './ledger.css'

const money = (n) => (Number(n) || 0).toFixed(2)
const dateOnly = (d) => (d ? String(d).slice(0, 10) : '—')

const STATUS_FILTERS = ['', 'SETTLED', 'PARTIALLY_PAID', 'REFUNDED', 'CANCELLED']

// How refunded a sale is, as the API derives it. Deliberately NOT the document
// status: the sale stays SETTLED forever now — a return is its own credit note
// — so "partly refunded" is a separate axis from "settled / cancelled".
const REFUND_STATE_LABEL = {
  PARTIALLY_REFUNDED: 'Part refunded',
  REFUNDED: 'Refunded',
}

/**
 * The accountant's view: settled sales as numbered documents.
 *
 * Deliberately read-only. A settled document is corrected by refund, never by
 * editing — so the only action offered on one is Refund, and the UI reflects
 * that rather than hiding disabled edit controls.
 */
const Ledger = () => {
  // The ledger is offered on TRANSACTIONS:READ — anyone who may see the books.
  // A refund moves money back out of them, which is WRITE.
  const canRefund = useCan(SCOPES.TRANSACTIONS_WRITE)
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [refundTarget, setRefundTarget] = useState(null)
  const [refundReason, setRefundReason] = useState('')
  const [refunding, setRefunding] = useState(false)
  // ── Partial returns ───────────────────────────────────────────────────────
  // A separate action from Refund: Refund reverses the whole document, this
  // picks which lines and how many of each actually came back.
  const [returnTarget, setReturnTarget] = useState(null)
  const [returning, setReturning] = useState(false)
  const [reasons, setReasons] = useState([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = { limit: 100 }
      if (status) params.status = status
      if (search) params.search = search
      setDocuments(await posService.getLedgerDocuments(params))
    } catch {
      toast.error('Failed to load ledger')
    } finally {
      setLoading(false)
    }
  }, [status, search])

  useEffect(() => { load() }, [load])

  // The reason taxonomy, fetched once. A picker with no reasons cannot submit,
  // so this failing is worth surfacing rather than leaving an empty dropdown.
  useEffect(() => {
    let cancelled = false
    // Promise.resolve wraps it so a service that throws synchronously, or
    // returns nothing, cannot white-screen the whole ledger over an auxiliary
    // dropdown. The reasons are needed to SUBMIT a return, not to read the books.
    Promise.resolve()
      .then(() => posService.getReturnReasons())
      .then((rows) => { if (!cancelled) setReasons(Array.isArray(rows) ? rows : []) })
      .catch(() => { if (!cancelled) toast.error('Failed to load return reasons') })
    return () => { cancelled = true }
  }, [])

  const openDocument = async (id) => {
    setDetailLoading(true)
    try {
      setSelected(await posService.getLedgerDocument(id))
    } catch {
      toast.error('Failed to load document')
    } finally {
      setDetailLoading(false)
    }
  }

  const handleReturn = async (payload) => {
    if (!returnTarget) return
    setReturning(true)
    try {
      const result = await posService.createLedgerReturn(returnTarget.Id, payload)
      toast.success(
        `Return recorded as ${result.transactionNo} — ₹${money(result.grossAmount)} back`,
      )
      setReturnTarget(null)
      // Re-open the document rather than closing it: the operator almost always
      // wants to see what the invoice now says, and a screen that vanishes on
      // success makes them go and find it again.
      await openDocument(returnTarget.Id)
      await load()
    } catch (e) {
      // The server's message names the invariant that was broken — "sold 3,
      // already returned 2, asked for 2" — which is far more useful than a
      // generic failure.
      toast.error(e?.response?.data?.message || 'Failed to record the return')
    } finally {
      setReturning(false)
    }
  }

  const handleRefund = async () => {
    if (!refundTarget) return
    setRefunding(true)
    try {
      await posService.refundLedgerDocument(refundTarget.Id, refundReason)
      toast.success('Document refunded')
      setRefundTarget(null)
      setRefundReason('')
      setSelected(null)
      await load()
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to refund')
    } finally {
      setRefunding(false)
    }
  }

  return (
    <div className="fd-ledger">
      <h1>📒 Ledger</h1>
      <p className="fd-ledger-lead">
        Settled sales as numbered accounting documents. Read-only — a settled
        document is corrected by refund, never by editing.
      </p>

      <div className="fd-ledger-filters">
        <input
          className="fd-menu-search"
          placeholder="Search invoice no., customer or mobile…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 320, marginBottom: 0 }}
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          {STATUS_FILTERS.map((s) => (
            <option key={s || 'all'} value={s}>{s || 'All statuses'}</option>
          ))}
        </select>
        <button className="fd-btn fd-btn-outline" onClick={load}>🔄 Refresh</button>
      </div>

      {loading ? (
        <div className="fd-loading">Loading ledger…</div>
      ) : documents.length === 0 ? (
        <div className="fd-empty">
          No documents yet. Settling a bill posts it here as an invoice.
        </div>
      ) : (
        <div className="table-scroll-wrapper">
          <table className="fd-ledger-table">
            <thead>
              <tr>
                <th>Invoice</th><th>Date</th><th>Token / Table</th><th>Customer</th>
                <th className="num">Net</th><th className="num">Tax</th>
                <th className="num">Total</th>
                {/* Staff see "₹500 of ₹1,240 returned" without opening
                    anything. Total is NOT reduced — the original is what the
                    customer's printed bill says. */}
                <th className="num">Returned</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((d) => (
                <tr key={d.Id} onClick={() => openDocument(d.Id)} className="is-clickable">
                  <td className="fd-ledger-no">{d.TransactionNo}</td>
                  <td>{dateOnly(d.TransactionDate)}</td>
                  {/* Which counter customer or which table this invoice came
                      from. Resolved server-side (Source), so the list and the
                      detail cannot label the same document differently. */}
                  <td>{d.Source?.label
                    ? (
                      <span className={`fd-source-chip is-${d.Source.kind}`}>
                        {d.Source.kind === 'token' ? '🎫' : '🪑'} {d.Source.label}
                      </span>
                    )
                    : <span className="muted">—</span>}
                  </td>
                  <td>
                    {d.CustomerName || <span className="muted">Walk-in</span>}
                    {d.CustomerMobile && <div className="muted small">{d.CustomerMobile}</div>}
                  </td>
                  <td className="num">₹{money(d.NetAmount)}</td>
                  <td className="num">₹{money(d.TaxAmount)}</td>
                  <td className="num strong">₹{money(d.GrossAmount)}</td>
                  <td className="num">
                    {Number(d.ReturnedAmount) > 0 ? (
                      <>
                        <span className="fd-returned-amount">−₹{money(d.ReturnedAmount)}</span>
                        <div className="muted small">net ₹{money(d.NetOfReturns)}</div>
                      </>
                    ) : <span className="muted">—</span>}
                  </td>
                  <td>
                    <span className={`fd-ledger-status ${String(d.StatusName || '').toLowerCase()}`}>
                      {d.StatusName}
                    </span>
                    {REFUND_STATE_LABEL[d.RefundState] && (
                      <div className={`fd-refund-chip is-${String(d.RefundState).toLowerCase()}`}>
                        {REFUND_STATE_LABEL[d.RefundState]}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Hidden while the return picker is up. Two stacked backdrops darken to
          near-black and the invoice behind it cannot be read or acted on
          anyway; cancelling the picker leaves `selected` intact, so the
          invoice comes straight back. */}
      {(selected || detailLoading) && !returnTarget && (
        <div className="fd-modal-backdrop" role="dialog" aria-label="Invoice">
          <div className="fd-invoice-view">
            {detailLoading ? (
              <div className="fd-loading">Loading…</div>
            ) : (
              <>
                <div className="fd-invoice-head">
                  <div>
                    <div className="muted small">Invoice</div>
                    <h3>{selected.TransactionNo}</h3>
                  </div>
                  <span className={`fd-ledger-status ${String(selected.StatusName || '').toLowerCase()}`}>
                    {selected.StatusName}
                  </span>
                </div>

                <div className="fd-invoice-meta">
                  <span>{dateOnly(selected.TransactionDate)}</span>
                  {selected.BranchName && <span>{selected.BranchName}</span>}
                  <span>{selected.CustomerName || 'Walk-in'}</span>
                  {selected.CustomerMobile && <span>{selected.CustomerMobile}</span>}
                </div>

                {/* The rounds behind this invoice: which token or table each
                    came from, and a link into the order itself. An invoice used
                    to stand alone here with no way back to the floor it came
                    from. An expense document covers no rounds, so this is
                    legitimately absent rather than empty. */}
                {selected.Orders?.length > 0 && (
                  <div className="fd-invoice-orders">
                    <div className="fd-section-title">Orders on this invoice</div>
                    <ul>
                      {selected.Orders.map((o) => (
                        <li key={o.OrderId}>
                          <OrderNoLink orderId={o.OrderId}>{o.OrderNo}</OrderNoLink>
                          {o.TokenLabel ? (
                            <span className="fd-source-chip is-token">🎫 Token {o.TokenLabel}</span>
                          ) : o.TableName ? (
                            <span className="fd-source-chip is-table">🪑 {o.TableName}</span>
                          ) : (
                            <span className="muted">No token or table</span>
                          )}
                          <span className="muted small">₹{money(o.OrderTotal)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="fd-table-scroll">
                  <table className="fd-invoice-lines">
                    <thead>
                      <tr>
                        <th>#</th><th>Item</th><th className="num">Qty</th>
                        <th className="num">Rate</th><th className="num">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(selected.Lines || []).map((l) => (
                        <tr key={l.Id}>
                          <td>{l.LineNo}</td>
                          <td>
                            {l.ItemName || l.Comment || l.ItemId}
                            {/* Options as sold, so the customer can see what they got. */}
                            {(l.Variants || []).length > 0 && (
                              <div className="fd-invoice-variants">
                                {l.Variants.map((v, i) => (
                                  <span className="ci-variant-chip" key={v.id || i}>
                                    {v.name}{Number(v.price) > 0 ? ` +₹${money(v.price)}` : ''}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="num">
                            {Number(l.Quantity)}
                            {/* "2 of 3 returned" against the line, rather than
                                mutating the quantity it was sold at — mutating
                                it would make the document stop matching the
                                printed bill the customer is holding. */}
                            {Number(l.ReturnedQty) > 0 && (
                              <div className="fd-line-returned">
                                {Number(l.ReturnedQty)} of {Number(l.Quantity)} returned
                              </div>
                            )}
                          </td>
                          <td className="num">₹{money(l.UnitPrice)}</td>
                          <td className="num">₹{money(l.GrossAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="fd-invoice-totals">
                  <div><span>Net</span><span>₹{money(selected.NetAmount)}</span></div>
                  {Number(selected.DiscountAmount) > 0 && (
                    <div><span>Discount</span><span>−₹{money(selected.DiscountAmount)}</span></div>
                  )}
                  {(selected.TaxByComponent || []).map((c) => (
                    <div className="sub" key={c.name}><span>{c.name}</span><span>₹{money(c.amount)}</span></div>
                  ))}
                  <div><span>Tax</span><span>₹{money(selected.TaxAmount)}</span></div>
                  {Number(selected.RoundOff) !== 0 && (
                    <div className="sub"><span>Round off</span><span>₹{money(selected.RoundOff)}</span></div>
                  )}
                  {/* The original total stays the primary figure. Overwriting
                      it with the net would make the document stop matching the
                      piece of paper the customer is holding. */}
                  <div className="grand"><span>Total</span><span>₹{money(selected.GrossAmount)}</span></div>
                  {Number(selected.ReturnedAmount) > 0 && (
                    <>
                      <div className="fd-returned-line">
                        <span>Returned</span><span>−₹{money(selected.ReturnedAmount)}</span>
                      </div>
                      <div className="grand"><span>Net of returns</span><span>₹{money(selected.NetOfReturns)}</span></div>
                    </>
                  )}
                </div>

                {/* ── Linked credit notes ──────────────────────────────────
                    The difference between "this was partly refunded" and "here
                    is exactly what happened": every note with its reason,
                    amount and timestamp. */}
                {(selected.Returns || []).length > 0 && (
                  <div className="fd-invoice-returns">
                    <h4>Returns against this invoice</h4>
                    <ul>
                      {selected.Returns.map((n) => (
                        <li key={n.Id}>
                          <span className="fd-ledger-no">{n.TransactionNo}</span>
                          <span className="fd-returned-amount">−₹{money(n.GrossAmount)}</span>
                          <span className={n.IsFault ? 'fd-reason-fault' : 'muted'}>
                            {n.ReasonName || 'Unspecified'}
                          </span>
                          {n.Remarks && !String(n.Remarks).startsWith('idem:') && (
                            <span className="muted small">{n.Remarks}</span>
                          )}
                          <span className="muted small">
                            {n.CreatedOn ? new Date(n.CreatedOn).toLocaleString() : ''}
                          </span>
                          <span className="muted small">{n.CreatedBy}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="fd-invoice-section">Payments</div>
                <ul className="fd-invoice-tenders">
                  {(selected.Tenders || []).length === 0 && <li className="muted">No payments recorded.</li>}
                  {(selected.Tenders || []).map((t, i) => (
                    <li key={i}>
                      <span>{t.PaymentMode}{t.RefNo ? ` · ${t.RefNo}` : ''}</span>
                      <span className={Number(t.Amount) < 0 ? 'refunded' : ''}>₹{money(t.Amount)}</span>
                    </li>
                  ))}
                </ul>

                {/* The audit trail — how this document reached its status. */}
                <div className="fd-invoice-section">History</div>
                <ul className="fd-invoice-history">
                  {(selected.History || []).map((h) => (
                    <li key={h.Id}>
                      <span>{h.StatusName}</span>
                      <span className="muted small">{h.CreatedBy}</span>
                    </li>
                  ))}
                </ul>

                <div className="fd-invoice-actions">
                  <button className="fd-btn fd-btn-outline" onClick={() => window.print()}>Print</button>
                  {/* Both actions stay available while ANY of the invoice is
                      left. The sale is no longer mutated by a refund, so a
                      partly-returned invoice is still SETTLED and can still be
                      returned against — which is the whole point. */}
                  {selected.StatusName === 'SETTLED'
                    && selected.RefundState !== 'REFUNDED' && canRefund && (
                    <>
                      <button className="fd-btn fd-btn-warning" onClick={() => setReturnTarget(selected)}>
                        Return items
                      </button>
                      <button className="fd-btn fd-btn-danger" onClick={() => setRefundTarget(selected)}>
                        Refund all
                      </button>
                    </>
                  )}
                  <button className="fd-btn fd-btn-outline" onClick={() => setSelected(null)}>Close</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <ReturnPicker
        document={returnTarget}
        reasons={reasons}
        busy={returning}
        onCancel={() => setReturnTarget(null)}
        onConfirm={handleReturn}
      />

      {refundTarget && (
        <div className="fd-modal-backdrop" role="dialog" aria-label="Refund document">
          <div className="fd-variant-modal">
            <h3>Refund {refundTarget.TransactionNo}?</h3>
            <p className="fd-variant-hint">
              The whole document is reversed. Nothing is deleted — the original
              invoice stands and a reversing entry is recorded beside it.
            </p>
            <label htmlFor="refund-reason">Reason</label>
            <input
              id="refund-reason"
              type="text"
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              placeholder="e.g. Wrong order"
              style={{ width: '100%', boxSizing: 'border-box', marginBottom: 12 }}
            />
            <div className="fd-variant-actions">
              <button className="fd-btn fd-btn-danger" onClick={handleRefund} disabled={refunding}>
                {refunding ? 'Refunding…' : 'Confirm Refund'}
              </button>
              <button className="fd-btn fd-btn-outline" onClick={() => setRefundTarget(null)} disabled={refunding}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Ledger
