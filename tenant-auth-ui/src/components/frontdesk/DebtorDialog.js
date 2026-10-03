import React, { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import posService from '../../services/posService'
import './collect.css'

/**
 * Name who owes a balance on a sale that was saved short without one.
 *
 * Only the invoice's customer snapshot changes; a guest record is never created
 * or renamed. The server refuses it once the balance is paid or when the sale
 * is already linked to a guest.
 *
 * @param {Object} props
 * @param {Object} props.doc - { Id, TransactionNo, Due }
 * @param {Function} props.onClose
 * @param {Function} props.onDone - Called with { CustomerName, CustomerMobile }.
 */
const DebtorDialog = ({ doc, onClose, onDone }) => {
  const [name, setName] = useState('')
  const [mobile, setMobile] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, busy])

  if (!doc) return null

  const submit = async (e) => {
    e.preventDefault()
    if (!name.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await posService.setLedgerDebtor(doc.Id, { Name: name.trim(), Mobile: mobile.trim() || null })
      toast.success(`Name added to ${doc.TransactionNo}`)
      onDone?.(result)
    } catch (err) {
      setError(err?.response?.data?.message || 'The name could not be saved. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fd-modal-backdrop fd-collect-backdrop" onClick={() => !busy && onClose()}>
      <form
        className="fd-collect"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fd-debtor-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        noValidate
      >
        <div className="fd-collect-head">
          <div>
            <h3 id="fd-debtor-title">Who owes ₹{(Number(doc.Due) || 0).toFixed(2)}?</h3>
            <span className="fd-collect-sub">{doc.TransactionNo}</span>
          </div>
          <button type="button" className="fd-collect-x" onClick={onClose} aria-label="Close" disabled={busy}>×</button>
        </div>
        <div className="fd-collect-field">
          <label className="fd-collect-label" htmlFor="fd-debtor-name">Name</label>
          <input
            id="fd-debtor-name" className="fd-collect-text" autoComplete="off" autoFocus
            value={name} maxLength={150} onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="fd-collect-field">
          <label className="fd-collect-label" htmlFor="fd-debtor-mobile">Mobile (optional)</label>
          <input
            id="fd-debtor-mobile" className="fd-collect-text" inputMode="tel" autoComplete="off"
            value={mobile} maxLength={50} onChange={(e) => setMobile(e.target.value)}
          />
          <span className="fd-collect-hint">Shown in Dues so anyone on shift can follow up.</span>
        </div>
        {error && <div className="fd-collect-outcome is-err" role="alert">{error}</div>}
        <div className="fd-collect-foot">
          <div className="fd-collect-btns">
            <button type="button" className="fd-btn fd-btn-outline" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="fd-btn fd-btn-success" disabled={!name.trim() || busy}>
              {busy ? 'Saving…' : 'Save name'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

export default DebtorDialog
