import React, { useState } from 'react'
import { CheckIcon } from './DineIcons'

/**
 * D4 — asked only on a guest's first visit (or while they are still "Guest").
 * Optional: skipping is a first-class choice, not a dead end.
 */
const DineName = ({ venue, busy, onSave, onSkip }) => {
  const [name, setName] = useState('')
  const place = venue.businessName || venue.branchName || 'us'

  const submit = (e) => {
    e.preventDefault()
    if (name.trim()) onSave(name.trim())
    else onSkip()
  }

  return (
    <form className="dine-screen" onSubmit={submit} noValidate>
      <main className="dine-pad" style={{ paddingTop: 80 }}>
        <div style={{ width: 64, height: 64, borderRadius: 999, background: 'var(--dine-ok-soft)', color: 'var(--dine-ok)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <CheckIcon size={30} />
        </div>
        <div className="dine-stack">
          <h1 className="dine-display dine-h1">Number verified. Welcome to {place}!</h1>
          <p className="dine-muted" style={{ margin: 0, fontSize: 15 }}>What should we call you? Staff see this name with your order.</p>
        </div>
        <div className="dine-stack">
          <label className="dine-label" htmlFor="dine-name">Your name <span style={{ fontWeight: 400, color: 'var(--dine-faint)' }}>(optional)</span></label>
          <input
            id="dine-name"
            className="dine-input"
            type="text"
            autoComplete="given-name"
            maxLength={100}
            placeholder="e.g. Priya"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={busy}
          />
        </div>
        <div className="dine-spacer" />
        <div className="dine-stack" style={{ gap: 6 }}>
          <button type="submit" className="dine-btn dine-btn-primary" disabled={busy}>Continue to menu</button>
          <button type="button" className="dine-btn dine-btn-ghost" onClick={onSkip} disabled={busy}>Skip</button>
        </div>
      </main>
    </form>
  )
}

export default DineName
