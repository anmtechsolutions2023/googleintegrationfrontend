import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import posService from '../../services/posService'
import { SCOPES } from '../../constants'
import { useCan } from '../../hooks/useCan'
import { fullStamp, billDate, sourceLabel } from '../../utils/writeOffs'
import './writeoffs.css'

const money = (n) => (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * One write-off, the whole story: what the bill was, what was paid and how,
 * what was given up, why, by whom and when.
 *
 * Read-only. A write-off cannot be undone, so there is nothing to act on here
 * beyond opening the invoice itself. A drawer on a desk, a bottom sheet on a
 * phone.
 *
 * The register row carries everything but the payments; those come from the
 * invoice, and the panel stands without them if that read fails.
 *
 * @param {Object} props
 * @param {Object|null} props.doc - A row from GET /api/ledger/reports/write-offs.
 * @param {Function} props.onClose
 */
const WriteOffDetail = ({ doc, onClose }) => {
  const canAudit = useCan(SCOPES.AUDIT_READ)
  // null while loading, false when the read failed.
  const [invoice, setInvoice] = useState(null)

  useEffect(() => {
    if (!doc) return undefined
    let live = true
    setInvoice(null)
    posService.getLedgerDocument(doc.Id)
      .then((d) => { if (live) setInvoice(d || false) })
      .catch(() => { if (live) setInvoice(false) })
    return () => { live = false }
  }, [doc])

  useEffect(() => {
    if (!doc) return undefined
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [doc, onClose])

  if (!doc) return null

  const gross = Number(doc.GrossAmount) || 0
  const paid = Number(doc.Collected) || 0
  const returned = Number(doc.Returned) || 0
  const writtenOff = Number(doc.WrittenOff) || 0
  const pct = (v) => (gross > 0 ? Math.max(0, Math.min(100, (v / gross) * 100)) : 0)
  const payments = invoice ? (invoice.Tenders || []).filter((t) => Number(t.Amount) > 0) : []

  return (
    <div className="fd-wo-backdrop" onClick={onClose}>
      <aside
        className="fd-wo-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fd-wo-detail-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="fd-wo-drawer-head">
          <div>
            <span className="fd-wo-eyebrow">Write-off</span>
            <h2 id="fd-wo-detail-title">
              <span className="fd-wo-no">{doc.TransactionNo}</span>
              <span className="fd-wo-settled">Settled</span>
            </h2>
            <span className="fd-wo-sub">
              {[`Billed ${billDate(doc.TransactionDate)}`, sourceLabel(doc.Source), doc.BranchName].filter(Boolean).join(' · ')}
            </span>
          </div>
          <button type="button" className="fd-wo-x" onClick={onClose} aria-label="Close">×</button>
        </header>

        <div className="fd-wo-drawer-body">
          <div className="fd-wo-headline">
            <b>₹{money(writtenOff)} written off</b>
            <span>{doc.ReasonLabel}</span>
          </div>

          <div className="fd-wo-split">
            <div className="fd-wo-split-bar" aria-hidden="true">
              <span className="is-paid" style={{ width: `${pct(paid)}%` }} />
              {returned > 0 && <span className="is-returned" style={{ width: `${pct(returned)}%` }} />}
              <span className="is-written" style={{ width: `${pct(writtenOff)}%` }} />
            </div>
            <div className="fd-wo-split-legend">
              <span><i className="is-paid" />Paid ₹{money(paid)}</span>
              {returned > 0 && <span><i className="is-returned" />Returned ₹{money(returned)}</span>}
              <span><i className="is-written" />Written off ₹{money(writtenOff)}</span>
              <span className="muted">Bill ₹{money(gross)}</span>
            </div>
          </div>

          <dl className="fd-wo-facts">
            <dt>Customer</dt>
            <dd>{doc.CustomerName || 'Walk-in'}{doc.CustomerMobile ? ` · ${doc.CustomerMobile}` : ''}</dd>
            <dt>Written off</dt>
            <dd>{fullStamp(doc.WrittenOffAt)}{doc.OnEarlierBill ? ' · on a bill from before this period' : ''}</dd>
            <dt>By</dt>
            <dd>{doc.WrittenOffByName || '—'}</dd>
            <dt>Note</dt>
            <dd>{doc.Note ? `“${doc.Note}”` : <span className="muted">No note added</span>}</dd>
          </dl>

          <section className="fd-wo-story" aria-label="What happened">
            <h3>What happened</h3>
            <ol>
              {invoice === null && <li className="muted">Loading the payments…</li>}
              {payments.map((t, i) => (
                <li key={t.Id || i}>
                  <span className="fd-wo-when">{fullStamp(t.Timestamp)}</span>
                  <span>Paid ₹{money(t.Amount)}{t.PaymentMode ? ` by ${t.PaymentMode}` : ''}</span>
                </li>
              ))}
              <li className="is-writeoff">
                <span className="fd-wo-when">{fullStamp(doc.WrittenOffAt)}</span>
                <span>₹{money(writtenOff)} written off by {doc.WrittenOffByName || 'an admin'} — the invoice is now Settled</span>
              </li>
              <li className="muted">Recorded in the audit log as “Balance written off”.</li>
            </ol>
          </section>

          <p className="fd-wo-final">
            A write-off cannot be undone. Sales still show ₹{money(gross)} for this bill; the ₹{money(writtenOff)} sits
            under Written off.
          </p>
        </div>

        <footer className="fd-wo-drawer-foot">
          <Link className="fd-btn fd-btn-primary" to={`/money/ledger?doc=${doc.Id}`}>Open invoice in Ledger</Link>
          {canAudit && <Link className="fd-btn fd-btn-outline" to="/org/audit">Audit log</Link>}
        </footer>
      </aside>
    </div>
  )
}

export default WriteOffDetail
