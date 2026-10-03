import React, { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import posService from '../../services/posService'
import './collect.css'

const money = (n) => (Number(n) || 0).toFixed(2)

// Mirrors LEDGER.WRITE_OFF_REASONS on the server, which validates the code.
// [code, label, noteRequired]
export const WRITE_OFF_REASONS = [
  ['CUSTOMER_LEFT', 'Customer left without paying', false],
  ['DISPUTED', 'Disputed item', false],
  ['STAFF_GUEST', "Staff or owner's guest", false],
  ['OTHER', 'Other', true],
]

/**
 * Write off what a sale still owes, and close it.
 *
 * Admins only — the caller decides whether to offer it. The amount is never
 * sent: the server writes off exactly what is due when it locks the invoice, so
 * a payment collected a moment ago by someone else cannot be written off too.
 *
 * The copy says plainly what happens to the books, because this is the one
 * action on these screens that cannot be undone.
 *
 * @param {Object} props
 * @param {Object} props.doc - { Id, TransactionNo, GrossAmount, Paid, Due, CustomerName }
 * @param {Function} props.onClose
 * @param {Function} props.onDone - Called with the server's result.
 */
const WriteOffDialog = ({ doc, onClose, onDone }) => {
  const [reason, setReason] = useState('CUSTOMER_LEFT')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, busy])

  if (!doc) return null
  const noteRequired = WRITE_OFF_REASONS.find(([c]) => c === reason)?.[2]
  const canSubmit = !busy && (!noteRequired || note.trim().length > 0)

  const submit = async (e) => {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    try {
      const result = await posService.writeOffLedgerBalance(doc.Id, { Reason: reason, Note: note.trim() || null })
      toast.success(`₹${money(result.writtenOff)} written off. ${result.transactionNo || doc.TransactionNo} is closed.`)
      onDone?.(result)
    } catch (err) {
      setError(err?.response?.data?.message || 'The balance could not be written off. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const who = doc.CustomerName || 'The customer'

  return (
    <div className="fd-modal-backdrop fd-collect-backdrop" onClick={() => !busy && onClose()}>
      <form
        className="fd-collect"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="fd-writeoff-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        noValidate
      >
        <div className="fd-collect-head">
          <div>
            <h3 id="fd-writeoff-title">Write off ₹{money(doc.Due)} on {doc.TransactionNo}?</h3>
            <span className="fd-collect-sub">{who} paid ₹{money(doc.Paid)} of ₹{money(doc.GrossAmount)}</span>
          </div>
          <button type="button" className="fd-collect-x" onClick={onClose} aria-label="Close" disabled={busy}>×</button>
        </div>

        <p className="fd-collect-explain">
          This closes the invoice as Settled and records ₹{money(doc.Due)} as a write-off. Sales stay at
          ₹{money(doc.GrossAmount)}, and the ₹{money(doc.Due)} appears under Written off in Finance.
          You can't undo this.
        </p>

        <fieldset className="fd-collect-field">
          <legend className="fd-collect-label">Reason</legend>
          <div className="fd-collect-reasons">
            {WRITE_OFF_REASONS.map(([code, label]) => (
              <label key={code}>
                <input
                  type="radio" name="fd-writeoff-reason" value={code}
                  checked={reason === code} onChange={() => setReason(code)}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="fd-collect-field">
          <label className="fd-collect-label" htmlFor="fd-writeoff-note">
            Note{noteRequired ? '' : ' (optional)'}
          </label>
          <textarea
            id="fd-writeoff-note" value={note} maxLength={500}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Said they would pay on the next visit"
          />
          {noteRequired && !note.trim() && (
            <span className="fd-collect-hint">A note is needed when the reason is Other.</span>
          )}
        </div>

        {error && <div className="fd-collect-outcome is-err" role="alert">{error}</div>}

        <div className="fd-collect-foot">
          <span className="fd-collect-hint">Recorded in the audit log with your name.</span>
          <div className="fd-collect-btns">
            <button type="button" className="fd-btn fd-btn-outline" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="fd-btn fd-btn-danger" disabled={!canSubmit}>
              {busy ? 'Writing off…' : `Write off ₹${money(doc.Due)}`}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

export default WriteOffDialog
