import React, { useCallback, useEffect, useRef, useState } from 'react'
import posService from '../../services/posService'

/**
 * Attach a customer to the order being taken.
 *
 * This is the link the CRM never had: pos_order.CustomerId has always existed
 * and the settle path has always carried it through to the ledger contact, but
 * no screen ever SET it — so every sale was a walk-in, and Visits / TotalSpent
 * / LoyaltyPoints read zero for everybody.
 *
 * Phone-first, because that is what a customer recites at a counter and it is
 * the column with the UNIQUE key. Searching is optional throughout: a queue
 * must never wait on a lookup, so the cashier can ignore this entirely and the
 * sale proceeds as a walk-in exactly as before.
 *
 * Presentational + one service call. Owns no order state: it reports a chosen
 * customer upward and the page decides what to do with it.
 */
const CustomerPicker = ({ value, onChange, disabled = false }) => {
  const [term, setTerm] = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState(null)
  const boxRef = useRef(null)

  // Debounced: a type-ahead beside a till should not fire a request per
  // keystroke, and the server caps results at ten anyway.
  useEffect(() => {
    const q = term.trim()
    if (q.length < 2) { setResults([]); return undefined }
    const t = setTimeout(async () => {
      setBusy(true)
      try {
        setResults(await posService.searchCustomers(q))
        setOpen(true)
      } catch {
        // A failed lookup must not block the sale — it just finds nobody.
        setResults([])
      } finally {
        setBusy(false)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [term])

  useEffect(() => {
    const onAway = (e) => { if (!boxRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onAway)
    return () => document.removeEventListener('mousedown', onAway)
  }, [])

  const pick = useCallback((customer) => {
    onChange(customer)
    setTerm('')
    setResults([])
    setOpen(false)
  }, [onChange])

  // A number that matched nobody is a new regular. Creating them here saves
  // sending the cashier to another screen mid-order.
  const createFromTerm = async () => {
    const q = term.trim()
    setCreating(true)
    setError(null)
    try {
      const isPhone = /^[0-9+\-\s]{6,}$/.test(q)
      const created = await posService.createCustomer({
        Name: isPhone ? `Guest ${q.slice(-4)}` : q,
        Phone: isPhone ? q : null,
      })
      pick({ Id: created.id || created.Id, Name: created.Name, Phone: created.Phone })
    } catch (e) {
      setError(e?.response?.data?.message || 'Could not add this customer')
    } finally {
      setCreating(false)
    }
  }

  if (value) {
    return (
      <div className="fd-customer-chip">
        <span className="fd-customer-chip-name">
          👤 {value.Name}
          {value.Phone && <em>{value.Phone}</em>}
        </span>
        {Number(value.Visits) > 0 && (
          <span className="fd-customer-chip-stat">
            {value.Visits} {Number(value.Visits) === 1 ? 'visit' : 'visits'}
            {Number(value.LoyaltyPoints) > 0 && ` · ${value.LoyaltyPoints} pts`}
          </span>
        )}
        <button
          type="button"
          className="fd-link-btn"
          onClick={() => onChange(null)}
          disabled={disabled}
        >
          Remove
        </button>
      </div>
    )
  }

  return (
    <div className="fd-customer-picker" ref={boxRef}>
      <label htmlFor="cust-search" className="fd-customer-label">
        Customer <span className="muted">(optional)</span>
      </label>
      <input
        id="cust-search"
        type="search"
        autoComplete="off"
        placeholder="Phone or name…"
        value={term}
        disabled={disabled}
        onChange={(e) => setTerm(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        aria-expanded={open}
        aria-controls="cust-results"
      />
      {busy && <span className="fd-customer-busy">…</span>}

      {open && (
        <ul className="fd-customer-results" id="cust-results" role="listbox">
          {results.map((c) => (
            <li key={c.Id}>
              <button type="button" onClick={() => pick(c)}>
                <span className="name">{c.Name}</span>
                <span className="muted">{c.Phone || '—'}</span>
                {Number(c.Visits) > 0 && (
                  <span className="fd-customer-chip-stat">{c.Visits} visits</span>
                )}
              </button>
            </li>
          ))}
          {results.length === 0 && term.trim().length >= 2 && !busy && (
            <li className="fd-customer-none">
              <span>No match for “{term.trim()}”</span>
              <button type="button" className="fd-link-btn" onClick={createFromTerm} disabled={creating}>
                {creating ? 'Adding…' : '+ Add as new customer'}
              </button>
            </li>
          )}
        </ul>
      )}
      {error && <div className="fd-settle-warn" role="alert">{error}</div>}
    </div>
  )
}

export default CustomerPicker
