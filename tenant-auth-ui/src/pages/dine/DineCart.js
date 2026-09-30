import React, { useState } from 'react'
import { BackIcon, DietMark, ShieldIcon } from './DineIcons'
import { rupees } from './cart'

/**
 * D7 — review and place.
 *
 * Totals shown are the SERVER's quote (priced exactly as the till prices), with
 * the phone's estimate only as a fallback while it loads. The guest is told
 * plainly that staff confirm the order before it is cooked.
 */
const DineCart = ({
  venue, cart, quote, quoting, busy, error, onBack, onChangeQty, onPlace,
}) => {
  const [instructions, setInstructions] = useState('')

  const estimate = cart.reduce((s, l) => s + l.unitPrice * l.quantity, 0)
  const subTotal = quote ? quote.subTotal : estimate
  const total = quote ? quote.total : estimate

  return (
    <div className="dine-screen">
      <main className="dine-pad" style={{ gap: 16 }}>
        <div className="dine-top" style={{ justifyContent: 'flex-start' }}>
          <button type="button" className="dine-icon-btn" onClick={onBack} aria-label="Back to menu"><BackIcon /></button>
          <div className="dine-stack" style={{ gap: 0 }}>
            <h1 className="dine-display" style={{ fontSize: 24 }}>Your order</h1>
            <span className="dine-small">{venue.tableName ? `Table ${venue.tableName}` : ''}</span>
          </div>
        </div>

        {cart.length === 0 ? (
          <div className="dine-empty">Your order is empty. <button type="button" className="dine-link" onClick={onBack}>Browse the menu</button></div>
        ) : (
          <>
            <div className="dine-card">
              {cart.map((l) => (
                <div key={l.key} className="dine-line">
                  <span style={{ marginTop: 4 }}><DietMark isVeg={l.isVeg} /></span>
                  <div className="dine-line-main">
                    <span className="dine-line-name">{l.name}</span>
                    {(l.variantNames.length > 0 || l.addonNames.length > 0) && (
                      <span className="dine-small">{[...l.variantNames, ...l.addonNames].join(' · ')}</span>
                    )}
                    {l.note && <span className="dine-small">“{l.note}”</span>}
                  </div>
                  <div className="dine-line-side">
                    <div className="dine-stepper is-light">
                      <button type="button" aria-label={`One less ${l.name}`} onClick={() => onChangeQty(l.key, -1)}>−</button>
                      <span>{l.quantity}</span>
                      <button type="button" aria-label={`One more ${l.name}`} onClick={() => onChangeQty(l.key, 1)}>+</button>
                    </div>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{rupees(l.unitPrice * l.quantity)}</span>
                  </div>
                </div>
              ))}
              <button type="button" className="dine-link" style={{ padding: '14px 0', fontSize: 14 }} onClick={onBack}>+ Add more dishes</button>
            </div>

            <div className="dine-stack">
              <label className="dine-label" htmlFor="dine-instructions">Instructions for the whole order</label>
              <textarea id="dine-instructions" className="dine-textarea" rows={2} maxLength={500} placeholder="e.g. serve starters first" value={instructions} onChange={(e) => setInstructions(e.target.value)} />
            </div>

            <div className="dine-card dine-totals" aria-live="polite">
              <div><span className="dine-muted">Item total</span><span>{rupees(subTotal)}</span></div>
              <div><span className="dine-muted">Taxes</span><span>{quote ? rupees(quote.taxAmount) : (quoting ? '…' : 'At the counter')}</span></div>
              <div className="is-grand"><span>Estimated total</span><span>{rupees(total)}</span></div>
              <span className="dine-small">The final amount is on your bill at the counter.</span>
            </div>
          </>
        )}

        <div className="dine-spacer" />
        {error && <div className="dine-callout dine-callout-bad" role="alert">{error}</div>}
        <div className="dine-callout dine-callout-info">
          <ShieldIcon />
          <span>A staff member confirms your order before it goes to the kitchen. You will see the status on the next screen.</span>
        </div>
        <button
          type="button"
          className="dine-btn dine-btn-primary"
          disabled={cart.length === 0 || busy}
          onClick={() => onPlace(instructions.trim())}
        >
          {busy ? 'Placing…' : `Place order · ${rupees(total)}`}
        </button>
      </main>
    </div>
  )
}

export default DineCart
