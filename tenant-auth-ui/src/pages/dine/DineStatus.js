import React from 'react'
import { rupees } from './cart'

const HERO = {
  waiting: { title: 'Waiting for staff to confirm', body: 'Usually under 2 minutes. Nothing is cooked until a staff member accepts your order.' },
  kitchen: { title: 'In the kitchen', body: 'Your order was accepted and sent to the kitchen.' },
  ready: { title: 'Ready, on its way', body: 'Your food is ready and will be served shortly.' },
  rejected: { title: 'Staff could not accept this order', body: 'Please talk to your server, or change your order.' },
}

const STEPS = [
  { key: 'placed', name: 'Order placed' },
  { key: 'waiting', name: 'Staff confirm' },
  { key: 'kitchen', name: 'In the kitchen' },
  { key: 'ready', name: 'Ready' },
]

const time = (iso) => {
  try { return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) } catch { return '' }
}

const Steps = ({ status, placedAt }) => {
  const at = STEPS.findIndex((s) => s.key === status)
  return (
    <ol className="dine-steps">
      {STEPS.map((s, i) => {
        const done = i < at || (status === 'ready' && i === at)
        const now = i === at && !done
        return (
          <li key={s.key} className={`dine-step ${done ? 'is-done' : ''} ${now ? 'is-now' : ''}`}>
            <div className="dine-step-rail">
              <span className="dine-step-dot">{done ? '✓' : ''}</span>
              <span className="dine-step-line" />
            </div>
            <div className="dine-step-text">
              <span className="dine-step-name">{s.name}</span>
              {i === 0 && <span className="dine-small">{time(placedAt)}</span>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/**
 * D8 — where each round stands. Polled by the parent; the newest round leads,
 * earlier ones follow as a compact list.
 */
const DineStatus = ({ venue, orders, canOrder, onOrderMore }) => {
  const [latest, ...earlier] = orders
  const place = venue.businessName || venue.branchName || 'the restaurant'

  return (
    <div className="dine-screen">
      <main className="dine-pad" style={{ gap: 18 }}>
        <div className="dine-top">
          <div className="dine-stack" style={{ gap: 0 }}>
            <div className="dine-display" style={{ fontSize: 22 }}>{venue.businessName || venue.branchName}</div>
            <div className="dine-small">{venue.tableName ? `Table ${venue.tableName}` : ''}</div>
          </div>
          <span className="dine-small">Updates every 20 s</span>
        </div>

        {!latest && <div className="dine-empty">No orders yet this visit.</div>}

        {latest && (
          <>
            <section className={`dine-hero-card is-${latest.status}`} aria-live="polite">
              <div className="dine-eyebrow" style={{ color: 'inherit' }}>{latest.orderNo}</div>
              <div className="dine-display" style={{ fontSize: 26 }}>{HERO[latest.status].title}</div>
              <div style={{ fontSize: 14.5, lineHeight: 1.5 }}>
                {latest.status === 'rejected' && latest.rejection?.reason
                  ? `Reason: ${latest.rejection.reason}${latest.rejection.note ? ` — ${latest.rejection.note}` : ''}. Please talk to your server.`
                  : HERO[latest.status].body}
              </div>
            </section>
            {latest.status !== 'rejected' && <Steps status={latest.status} placedAt={latest.placedAt} />}
            <div className="dine-card" style={{ padding: '12px 16px' }}>
              {latest.items.map((l, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '4px 0', fontSize: 14 }}>
                  <span>{l.quantity} × {l.name}{[...l.variants, ...l.addons].length ? ` (${[...l.variants, ...l.addons].join(', ')})` : ''}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, marginTop: 6, borderTop: '1px solid #f1ebe2', fontWeight: 700 }}>
                <span>Total</span><span>{rupees(latest.total)}</span>
              </div>
            </div>
          </>
        )}

        {earlier.length > 0 && (
          <section className="dine-stack">
            <h2 className="dine-section-title" style={{ fontSize: 17 }}>Earlier this visit</h2>
            {earlier.map((o) => (
              <div key={o.id} className="dine-card" style={{ padding: '10px 16px', display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                <span>{o.orderNo} · {HERO[o.status].title}</span>
                <span>{rupees(o.total)}</span>
              </div>
            ))}
          </section>
        )}

        <div className="dine-spacer" />
        <div className="dine-stack" style={{ gap: 10 }}>
          {canOrder && <button type="button" className="dine-btn dine-btn-primary" onClick={onOrderMore}>Order another round</button>}
          <div className="dine-small" style={{ textAlign: 'center' }}>
            Pay at the counter when you are done. This visit is saved to your {place} profile.
          </div>
        </div>
      </main>
    </div>
  )
}

export default DineStatus
