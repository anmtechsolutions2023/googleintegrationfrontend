import React, { useMemo, useState } from 'react'
import './frontdesk.css'

const GUESTS_MAX = 999

/**
 * Guests and waiter for the table being served, edited in place in the order
 * panel's header.
 *
 * Presentational: it holds only the draft being typed. Saving is the caller's —
 * before the first round it is remembered and sent with that round; after it,
 * it is written to every open round at once.
 *
 * The waiter list is the business's members who can take orders (the server
 * decides: admins, or a role with POS_ORDER:WRITE), each by name — or by
 * mobile when no name was entered. Those at THIS outlet come first and the rest
 * follow under their own heading, rather than being hidden: a manager covering
 * from another branch is still the person serving the table.
 *
 * A table may already carry a waiter who is no longer on that list (their role
 * changed). They are still shown, as the current choice, so the picker never
 * pretends the table is unassigned.
 *
 * @param {Object} props
 * @param {number|null} props.guests
 * @param {string|null} props.waiterId - Membership id.
 * @param {string|null} [props.waiterName] - The name on the round, for a waiter not in the list.
 * @param {Array<{Id: string, Name: string, BranchDetailId: string|null}>} props.waiters
 * @param {string|null} [props.branchId] - The outlet being served.
 * @param {number|null} [props.capacity] - The table's seats, offered as a shortcut.
 * @param {boolean} [props.busy]
 * @param {(v: {guests: number|null, waiterId: string|null}) => void} props.onSave
 * @param {() => void} props.onCancel
 */
const TableServiceEditor = ({
  guests, waiterId, waiterName = null, waiters = [], branchId = null, capacity = null,
  busy = false, onSave, onCancel,
}) => {
  const [draftGuests, setDraftGuests] = useState(guests == null ? '' : String(guests))
  const [draftWaiter, setDraftWaiter] = useState(waiterId || '')

  const { here, elsewhere } = useMemo(() => {
    const atOutlet = (w) => !branchId || !w.BranchDetailId || w.BranchDetailId === branchId
    return {
      here: waiters.filter(atOutlet),
      elsewhere: waiters.filter((w) => !atOutlet(w)),
    }
  }, [waiters, branchId])

  const parsed = draftGuests === '' ? null : Number(draftGuests)
  const invalid = parsed !== null && (!Number.isInteger(parsed) || parsed < 1 || parsed > GUESTS_MAX)

  const step = (delta) => {
    const next = Math.min(GUESTS_MAX, Math.max(1, (parsed || 0) + delta))
    setDraftGuests(String(next))
  }

  const submit = (e) => {
    e.preventDefault()
    if (invalid || busy) return
    onSave({ guests: parsed, waiterId: draftWaiter || null })
  }

  return (
    <form className="fd-service-editor" onSubmit={submit} aria-label="Guests and waiter">
      <div className="fd-service-field">
        <label htmlFor="fd-service-guests">Guests</label>
        <div className="fd-stepper">
          <button type="button" onClick={() => step(-1)} aria-label="One fewer guest" disabled={!parsed || parsed <= 1}>
            −
          </button>
          <input
            id="fd-service-guests"
            type="number"
            inputMode="numeric"
            min={1}
            max={GUESTS_MAX}
            value={draftGuests}
            placeholder="–"
            onChange={(e) => setDraftGuests(e.target.value)}
            aria-invalid={invalid}
          />
          <button type="button" onClick={() => step(1)} aria-label="One more guest">+</button>
        </div>
        {capacity > 0 && parsed !== capacity && (
          <button type="button" className="fd-link-btn" onClick={() => setDraftGuests(String(capacity))}>
            Seats {capacity}
          </button>
        )}
      </div>

      <div className="fd-service-field">
        <label htmlFor="fd-service-waiter">Waiter</label>
        <select
          id="fd-service-waiter"
          value={draftWaiter}
          onChange={(e) => setDraftWaiter(e.target.value)}
        >
          <option value="">Not assigned</option>
          {waiterId && !waiters.some((w) => w.Id === waiterId) && (
            <option value={waiterId}>{waiterName || 'Current waiter'} (no longer takes orders)</option>
          )}
          {here.map((w) => <option key={w.Id} value={w.Id}>{w.Name}</option>)}
          {elsewhere.length > 0 && (
            <optgroup label="Other outlets">
              {elsewhere.map((w) => <option key={w.Id} value={w.Id}>{w.Name}</option>)}
            </optgroup>
          )}
        </select>
      </div>

      {invalid && <p className="fd-service-error">Guests must be a whole number from 1 to {GUESTS_MAX}.</p>}

      <div className="fd-service-actions">
        <button type="button" className="fd-btn fd-btn-outline fd-btn-sm" onClick={onCancel}>Cancel</button>
        <button type="submit" className="fd-btn fd-btn-primary fd-btn-sm" disabled={invalid || busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  )
}

export default TableServiceEditor
