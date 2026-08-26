import React from 'react'
import { PortalMonogram, portalRailStyle } from './PortalBadge'
import { slaSecondsLeft, slaTone } from '../../hooks/useOrderQueue'

// One order in the queue.
//
// What a card has to answer in the second somebody glances at it: which portal,
// how long have I got, how much is it worth to us, and what do I press.

const money = (n) => `₹${(Number(n) || 0).toFixed(2)}`

const TONE = {
  danger: { color: '#c0392b' },
  warning: { color: '#e67e22' },
  muted: { color: '#7f8c8d' },
  success: { color: '#1e8449' },
}

// mm:ss, and "late" rather than a negative number — a countdown that goes below
// zero reads as a bug at exactly the moment somebody needs to trust it.
const countdown = (seconds) => {
  if (seconds === null || seconds === undefined) return null
  if (seconds < 0) return 'late'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

const OrderCard = ({ order, selected, onSelect, onAccept, onReject, onAdvance, canWrite }) => {
  const status = String(order.Status || '').toLowerCase()
  const seconds = slaSecondsLeft(order)
  const tone = slaTone(seconds)
  const label = countdown(seconds)

  // What this order is waiting for, phrased as the thing that happens next
  // rather than the state it is in — the person reading it is deciding, not
  // auditing.
  const nextAction = status === 'new' ? 'to accept'
    : status === 'accepted' ? 'to cook'
      : status === 'processing' ? 'for pickup'
        : 'to arrive'

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={!!selected}
      onClick={() => onSelect?.(order)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect?.(order)
        }
      }}
      className="fd-order-card"
      style={{
        ...portalRailStyle(order),
        background: '#fff',
        border: `1px solid ${selected ? '#3498db' : '#e1e5eb'}`,
        borderLeftWidth: 4,
        borderRadius: 8,
        padding: '12px 15px',
        display: 'flex',
        alignItems: 'center',
        gap: 13,
        cursor: 'pointer',
        boxShadow: selected ? '0 3px 10px rgba(52,152,219,.16)' : '0 1px 3px rgba(0,0,0,.06)',
      }}
    >
      <PortalMonogram portal={order} size={30} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 14, color: '#2c3e50' }}>
            {order.PortalName || order.Platform || 'Portal'} {order.ExternalRef ? `#${order.ExternalRef}` : ''}
          </strong>
          {order.CustomerName && (
            <span style={{ fontSize: 12, color: '#7f8c8d' }}>{order.CustomerName}</span>
          )}
          {/* A line the portal sent that matched nothing on our menu. Flagged
              rather than rejected — see the ingest service. */}
          {!!order.HasUnmappedLines && (
            <span className="fd-badge fd-badge-pending">Unmapped item</span>
          )}
        </div>
        <div style={{ fontSize: 12, color: '#7f8c8d', marginTop: 2 }}>
          {order.OrderNo ? `${order.OrderNo} · ` : ''}
          {order.BranchName || ''}
        </div>
      </div>

      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#2c3e50' }}>
          {money(order.GrossAmount ?? order.ItemsTotal)}
        </div>
        {/* Net payout, because that is the number the owner actually cares
            about and the old screen never showed it. */}
        <div style={{ fontSize: 11, color: '#7f8c8d' }}>net {money(order.NetPayout)}</div>
      </div>

      {label && (
        <div style={{ width: 66, textAlign: 'center', flexShrink: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 800, ...TONE[tone] }}>{label}</div>
          <div style={{
            fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '.5px', ...TONE[tone],
          }}
          >
            {nextAction}
          </div>
        </div>
      )}

      {canWrite && (
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
          {status === 'new' && (
            <>
              <button type="button" className="fd-btn fd-btn-success" onClick={() => onAccept?.(order)}>
                Accept
              </button>
              <button type="button" className="fd-btn fd-btn-outline" onClick={() => onReject?.(order)}>
                Reject
              </button>
            </>
          )}
          {status === 'accepted' && (
            <button type="button" className="fd-btn fd-btn-outline" onClick={() => onAdvance?.(order, 'processing')}>
              Mark ready
            </button>
          )}
          {status === 'processing' && (
            <button type="button" className="fd-btn fd-btn-primary" onClick={() => onAdvance?.(order, 'out for delivery')}>
              Handed over
            </button>
          )}
          {status === 'out for delivery' && (
            <button type="button" className="fd-btn fd-btn-success" onClick={() => onAdvance?.(order, 'delivered')}>
              Delivered
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export { countdown }
export default OrderCard
