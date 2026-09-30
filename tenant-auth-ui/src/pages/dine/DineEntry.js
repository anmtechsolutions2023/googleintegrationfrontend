import React from 'react'
import { CheckIcon, TableIcon } from './DineIcons'

/**
 * D1 — what a guest sees the moment they scan the table's code.
 * The venue comes from the server's resolve of the token; nothing here is
 * taken from the URL.
 */
const DineEntry = ({ venue, logo, onContinue }) => {
  const title = venue.businessName || venue.branchName || 'Welcome'
  const subtitle = venue.businessName && venue.branchName ? venue.branchName : null
  const where = [venue.tableName && `Table ${venue.tableName}`, venue.floorName].filter(Boolean).join(' · ')

  return (
    <div className="dine-screen">
      <header className="dine-hero">
        <div className="dine-logo">
          {logo?.dataUri
            ? <img src={logo.dataUri} alt={`${title} logo`} />
            : <span className="dine-logo-fallback" aria-hidden="true">{title.charAt(0)}</span>}
        </div>
        <div className="dine-stack" style={{ alignItems: 'center', gap: 4 }}>
          <h1 className="dine-display" style={{ fontSize: 30 }}>{title}</h1>
          {subtitle && <div className="dine-muted" style={{ fontSize: 15 }}>{subtitle}</div>}
        </div>
        {where && <div className="dine-chip"><TableIcon /> {where}</div>}
      </header>

      <main className="dine-pad">
        <p style={{ margin: 0, fontSize: 20, lineHeight: 1.4, fontWeight: 500 }}>
          {venue.canOrder
            ? 'Order from your table. Verify your mobile number to see the menu.'
            : 'See the menu on your phone. Verify your mobile number to continue.'}
        </p>
        <ul className="dine-ticks">
          <li><span style={{ color: 'var(--dine-ok)' }}><CheckIcon /></span>A one-time code comes on WhatsApp. No app, no password.</li>
          {venue.canOrder && (
            <li><span style={{ color: 'var(--dine-ok)' }}><CheckIcon /></span>Our staff confirm every order before it goes to the kitchen.</li>
          )}
          <li><span style={{ color: 'var(--dine-ok)' }}><CheckIcon /></span>Pay at the counter as usual when you are done.</li>
        </ul>
        <div className="dine-spacer" />
        <div className="dine-stack" style={{ gap: 14 }}>
          <button type="button" className="dine-btn dine-btn-primary" onClick={onContinue}>
            Continue with mobile number
          </button>
          <div className="dine-small" style={{ textAlign: 'center' }}>Powered by Restro OS</div>
        </div>
      </main>
    </div>
  )
}

export default DineEntry
