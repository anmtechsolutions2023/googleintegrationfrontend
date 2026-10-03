import React, { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-toastify'
import posService from '../../services/posService'
import './collect.css'

const money = (n) => (Number(n) || 0).toFixed(2)
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100

/**
 * The tenders this outlet accepts, in one shape whichever source answered.
 *
 * The branch's resolved list is what the till offers; the tenant catalogue is
 * the fallback for someone who can see the books but not the outlet settings.
 * Portal settlement tenders are filtered out of both, exactly as at the till.
 */
const fromBranch = (methods) => (methods || [])
  .filter((m) => m.enabled && m.active !== false)
  .map((m) => ({
    id: m.paymentModeId,
    type: m.type,
    account: m.accountName,
    requiresRef: !!m.requiresReference,
  }))
const fromCatalogue = (rows) => (rows || [])
  .filter((m) => (m.EnabledByDefault ?? m.enabledByDefault ?? 1) && (m.Active ?? m.active ?? 1))
  .map((m) => ({
    id: m.Id ?? m.id,
    type: m.Type ?? m.type,
    account: m.AccountName ?? m.accountName,
    requiresRef: !!(m.RequiresReference ?? m.requiresReference),
  }))

const isCash = (mode) => String(mode?.type || '').trim().toLowerCase() === 'cash'
  || String(mode?.account || '').trim().toLowerCase() === 'cash'

/**
 * Collect payment — takes what a part-paid sale still owes.
 *
 * ONE sheet, opened from every place a due shows up (the Ledger row and drawer,
 * the order detail, the Dues worklist, the till's confirmation), so the rules
 * and the outcome are the same wherever somebody happens to be standing.
 *
 * The line under the amount says what will happen BEFORE anything is saved:
 * settled, still part-paid, change to hand back, or why it cannot be recorded.
 * The server repeats every rule; this only stops a cashier being surprised.
 *
 * @param {Object} props
 * @param {Object} props.doc - { Id, TransactionNo, GrossAmount, Paid, Due, CustomerName, BranchId, label }
 * @param {Function} props.onClose
 * @param {Function} props.onDone - Called with the server's result after a payment is recorded.
 * @param {Function} [props.onWriteOff] - Offered as a link when present (admins only).
 */
const CollectPaymentSheet = ({ doc, onClose, onDone, onWriteOff }) => {
  const due = round2(doc?.Due)
  const [modes, setModes] = useState(null)
  const [modeId, setModeId] = useState('')
  const [amount, setAmount] = useState(money(due))
  const [refNo, setRefNo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const amountRef = useRef(null)

  // The outlet's methods, falling back to the tenant catalogue.
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      let list = []
      try {
        if (doc?.BranchId) list = fromBranch((await posService.getBranchPaymentMethods(doc.BranchId))?.methods)
      } catch { /* fall through to the catalogue */ }
      if (list.length === 0) {
        try { list = fromCatalogue(await posService.getPaymentModes()) } catch { list = [] }
      }
      if (cancelled) return
      setModes(list)
      // Cash first when offered — most balances are settled in cash at the door.
      const first = list.find(isCash) || list[0]
      if (first) setModeId(first.id)
    }
    load()
    return () => { cancelled = true }
  }, [doc?.BranchId])

  // Escape closes; focus lands on the amount, the field most people change.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose() }
    document.addEventListener('keydown', onKey)
    amountRef.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, busy])

  const mode = useMemo(() => (modes || []).find((m) => m.id === modeId) || null, [modes, modeId])
  const typed = Number(String(amount).replace(/[₹,\s]/g, ''))

  // What will happen if Record is pressed now.
  const outcome = useMemo(() => {
    if (!mode) return { cls: 'is-err', text: 'Choose how the customer paid.', ok: false }
    if (!(typed > 0)) return { cls: 'is-err', text: 'Enter the amount received.', ok: false }
    if (!isCash(mode) && round2(typed) > due) {
      return { cls: 'is-err', text: `${mode.type} can't be more than the ₹${money(due)} due.`, ok: false }
    }
    const recorded = Math.min(round2(typed), due)
    const left = round2(due - recorded)
    const no = doc?.TransactionNo || 'This invoice'
    if (isCash(mode) && round2(typed) > due) {
      return { cls: 'is-ok', text: `Give ₹${money(typed - due)} change. ₹${money(due)} is recorded and ${no} is marked Settled.`, ok: true, recorded }
    }
    if (left <= 0) return { cls: 'is-ok', text: `${no} will be marked Settled.`, ok: true, recorded }
    return { cls: 'is-warn', text: `₹${money(left)} will still be due. ${no} stays Partially paid.`, ok: true, recorded }
  }, [mode, typed, due, doc?.TransactionNo])

  const needsRef = !!mode?.requiresRef
  const refMissing = needsRef && !refNo.trim()
  const canRecord = outcome.ok && !refMissing && !busy

  const submit = async (e) => {
    e.preventDefault()
    if (!canRecord) return
    setBusy(true)
    setError(null)
    try {
      const result = await posService.collectLedgerPayment(doc.Id, [{
        paymentModeId: mode.id,
        // Cash is sent as handed over, so the server can work out the change;
        // anything else is never more than the due.
        amount: isCash(mode) ? round2(typed) : Math.min(round2(typed), due),
        refNo: refNo.trim() || null,
      }])
      const no = result.transactionNo || doc.TransactionNo
      const change = Number(result.change) > 0 ? ` Give ₹${money(result.change)} change.` : ''
      toast.success(result.status === 'SETTLED'
        ? `${no} settled. ₹${money(result.collected)} received by ${mode.type}.${change}`
        : `₹${money(result.collected)} recorded. ₹${money(result.due)} still due on ${no}.${change}`)
      onDone?.(result)
    } catch (err) {
      // The server names exactly what was wrong — already settled by someone
      // else, a reference missing — so show that, in place.
      setError(err?.response?.data?.message || 'The payment could not be recorded. Try again.')
    } finally {
      setBusy(false)
    }
  }

  if (!doc) return null

  return (
    <div className="fd-modal-backdrop fd-collect-backdrop" onClick={() => !busy && onClose()}>
      <form
        className="fd-collect"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fd-collect-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        noValidate
      >
        <div className="fd-collect-head">
          <div>
            <h3 id="fd-collect-title">Collect payment</h3>
            <span className="fd-collect-sub">
              {[doc.TransactionNo, doc.label, doc.CustomerName || 'Walk-in'].filter(Boolean).join(' · ')}
            </span>
          </div>
          <button type="button" className="fd-collect-x" onClick={onClose} aria-label="Close" disabled={busy}>×</button>
        </div>

        <div className="fd-collect-sum">
          <div><span>Total</span><b>₹{money(doc.GrossAmount)}</b></div>
          <div><span>Paid</span><b>₹{money(doc.Paid)}</b></div>
          <div className="is-due"><span>Due</span><b>₹{money(due)}</b></div>
        </div>

        <fieldset className="fd-collect-field">
          <legend className="fd-collect-label">Paid by</legend>
          {modes === null ? (
            <span className="fd-collect-hint">Loading payment methods…</span>
          ) : modes.length === 0 ? (
            <span className="fd-collect-outcome is-err">No payment methods are switched on for this outlet.</span>
          ) : (
            <div className="fd-collect-modes">
              {modes.map((m) => (
                <label key={m.id} className={`fd-collect-mode ${m.id === modeId ? 'is-on' : ''}`}>
                  <input
                    type="radio" name="fd-collect-mode" value={m.id}
                    checked={m.id === modeId}
                    onChange={() => { setModeId(m.id); setRefNo(''); setError(null) }}
                  />
                  {m.type}
                  {m.account && <small>{isCash(m) ? 'till' : m.account}</small>}
                </label>
              ))}
            </div>
          )}
        </fieldset>

        <div className="fd-collect-field">
          <label className="fd-collect-label" htmlFor="fd-collect-amount">Amount received</label>
          <div className="fd-collect-amount">
            <span aria-hidden="true">₹</span>
            <input
              id="fd-collect-amount" ref={amountRef} inputMode="decimal" autoComplete="off"
              value={amount} onChange={(e) => { setAmount(e.target.value); setError(null) }}
            />
          </div>
          <div className="fd-collect-quick">
            <button type="button" onClick={() => setAmount(money(due))}>Full due ₹{money(due)}</button>
          </div>
        </div>

        {needsRef && (
          <div className="fd-collect-field">
            <label className="fd-collect-label" htmlFor="fd-collect-ref">{mode.type} reference</label>
            <input
              id="fd-collect-ref" className="fd-collect-text" autoComplete="off"
              value={refNo} onChange={(e) => setRefNo(e.target.value)}
              placeholder={String(mode.type).toLowerCase().includes('upi') ? '12-digit UTR' : 'Approval code'}
            />
            <span className="fd-collect-hint">Needed to match this payment to your bank statement.</span>
          </div>
        )}

        <div className={`fd-collect-outcome ${error ? 'is-err' : outcome.cls}`} role="status" aria-live="polite">
          {error || outcome.text}
        </div>
        {mode && (
          <div className="fd-collect-lands">
            Goes to <b>{isCash(mode) ? 'Cash drawer' : (mode.account || mode.type)}</b>
            {isCash(mode) ? ' · counted in the till that is open now' : ' · in today’s collections'}
          </div>
        )}

        <div className="fd-collect-foot">
          {onWriteOff && (
            <button type="button" className="fd-collect-link" onClick={onWriteOff} disabled={busy}>
              Can't collect? Write off the due
            </button>
          )}
          <div className="fd-collect-btns">
            <button type="button" className="fd-btn fd-btn-outline" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="fd-btn fd-btn-success" disabled={!canRecord}>
              {busy
                ? 'Recording…'
                : outcome.recorded
                  ? `Record ₹${money(outcome.recorded)}${mode ? ` by ${mode.type}` : ''}`
                  : 'Record payment'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

export default CollectPaymentSheet
