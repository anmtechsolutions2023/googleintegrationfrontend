import React from 'react'
import { PortalMonogram } from './PortalBadge'

// The selected order, in full.
//
// The one thing here the old screen never showed: commission and net payout.
// That is the number an owner cares about, and a queue that shows only the
// gross tells them how busy they are without telling them what they earned.

const money = (n) => `₹${(Number(n) || 0).toFixed(2)}`

const asLines = (v) => {
  if (Array.isArray(v)) return v
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v)
      return Array.isArray(parsed) ? parsed : []
    } catch { return [] }
  }
  return []
}

const Field = ({ label, value, hint }) => (
  <div>
    <div style={{
      fontSize: 10, fontWeight: 700, color: '#7f8c8d',
      textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 3,
    }}
    >
      {label}
    </div>
    <div style={{ fontSize: 13.5, color: '#2c3e50', fontWeight: 600 }}>{value || '—'}</div>
    {hint && <div style={{ fontSize: 12, color: '#7f8c8d' }}>{hint}</div>}
  </div>
)

const OrderDetailPanel = ({ order, canWrite, busy, onAccept, onReject, onAdvance }) => {
  if (!order) {
    return (
      <div className="fd-empty" style={{ background: '#fff', border: '1px solid #e1e5eb', borderRadius: 8 }}>
        Select an order to see its items, customer and payout.
      </div>
    )
  }

  const status = String(order.Status || '').toLowerCase()
  // OrderLines, not Lines: LINES is a reserved word in MySQL, so the column —
  // and therefore the API field — is named around it.
  const lines = asLines(order.OrderLines)

  return (
    <div style={{
      background: '#fff', border: '1px solid #e1e5eb', borderRadius: 8,
      boxShadow: '0 1px 3px rgba(0,0,0,.06)', display: 'flex', flexDirection: 'column',
      overflow: 'hidden', minHeight: 0,
    }}
    >
      <div style={{
        padding: '16px 18px', borderBottom: '1px solid #e1e5eb',
        display: 'flex', alignItems: 'center', gap: 11,
      }}
      >
        <PortalMonogram portal={order} size={32} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#2c3e50' }}>
            {order.PortalName || order.Platform} {order.ExternalRef ? `#${order.ExternalRef}` : ''}
          </div>
          <div style={{ fontSize: 11.5, color: '#7f8c8d' }}>
            {order.OrderNo ? `${order.OrderNo} · ` : ''}
            {order.PlacedOn ? new Date(order.PlacedOn).toLocaleString() : ''}
          </div>
        </div>
      </div>

      <div style={{
        padding: '14px 18px', borderBottom: '1px solid #f0f4f8',
        display: 'flex', gap: 22, flexWrap: 'wrap',
      }}
      >
        <Field label="Customer" value={order.CustomerName} hint={order.CustomerPhone} />
        <Field
          label="Payment"
          value={order.IsPrepaid ? 'Prepaid' : 'Pay on delivery'}
          hint={order.IsPrepaid ? 'Settled by portal' : null}
        />
        <Field label="Branch" value={order.BranchName} />
        {order.RiderName && <Field label="Rider" value={order.RiderName} hint={order.RiderPhone} />}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        <div style={{
          padding: '10px 18px 6px', fontSize: 10, fontWeight: 700, color: '#7f8c8d',
          textTransform: 'uppercase', letterSpacing: '.5px',
        }}
        >
          Items
        </div>

        {lines.length === 0 && (
          <div style={{ padding: '8px 18px', fontSize: 13, color: '#7f8c8d' }}>
            No items on this order.
          </div>
        )}

        {lines.map((line, index) => (
          // A line the portal sent that matched nothing on our menu is KEPT,
          // with the portal's own name and price, and shown in amber. Rejecting
          // the order over it would send a customer away hungry because a join
          // table was missing a row.
          <div
            key={`${line.externalItemId || line.name || 'line'}-${index}`}
            style={{
              padding: '8px 18px',
              borderBottom: '1px solid #f0f4f8',
              display: 'flex',
              alignItems: 'baseline',
              gap: 10,
              background: line.unmapped ? '#fdf0d5' : undefined,
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 700, color: '#7f8c8d', width: 24 }}>
              {line.qty}×
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, color: line.unmapped ? '#7a4a00' : '#2c3e50' }}>
                {line.name}
              </div>
              {line.unmapped && (
                <div style={{ fontSize: 11.5, color: '#9a6a1f' }}>
                  Not on our menu — kept as sent. Map it on the portal&apos;s listings so
                  future orders price correctly.
                </div>
              )}
              {line.notes && !line.unmapped && (
                <div style={{ fontSize: 11.5, color: '#7f8c8d' }}>{line.notes}</div>
              )}
            </div>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: '#2c3e50' }}>
              {money(line.grossAmount)}
            </span>
          </div>
        ))}
      </div>

      <div style={{
        padding: '14px 18px', borderTop: '1px solid #e1e5eb', background: '#f7f9fc',
        display: 'flex', flexDirection: 'column', gap: 6,
      }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#5a6c7d' }}>
          <span>Items</span><span>{money(order.ItemsTotal)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#5a6c7d' }}>
          <span>Tax</span><span>{money(order.TaxAmount)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#c0392b' }}>
          <span>
            {order.PortalName || 'Portal'} commission
            {order.CommissionPct ? ` (${Number(order.CommissionPct).toFixed(2)}%)` : ''}
          </span>
          <span>−{money(order.CommissionAmount)}</span>
        </div>
        <div style={{ height: 1, background: '#e1e5eb', margin: '3px 0' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#2c3e50' }}>Net payout</span>
          <span style={{ fontSize: 19, fontWeight: 800, color: '#1e8449' }}>
            {money(order.NetPayout)}
          </span>
        </div>
      </div>

      {canWrite && status !== 'delivered' && status !== 'cancelled' && (
        <div style={{ padding: '13px 18px', borderTop: '1px solid #e1e5eb', display: 'flex', gap: 8 }}>
          {status === 'new' && (
            <>
              <button
                type="button"
                className="fd-btn fd-btn-success fd-btn-lg"
                style={{ flex: 1 }}
                disabled={busy}
                onClick={() => onAccept?.(order)}
              >
                {busy ? 'Accepting…' : 'Accept & fire KOT'}
              </button>
              <button
                type="button"
                className="fd-btn fd-btn-outline"
                disabled={busy}
                onClick={() => onReject?.(order)}
              >
                Reject
              </button>
            </>
          )}
          {status === 'accepted' && (
            <button
              type="button"
              className="fd-btn fd-btn-primary fd-btn-lg"
              style={{ flex: 1 }}
              disabled={busy}
              onClick={() => onAdvance?.(order, 'processing')}
            >
              Mark ready
            </button>
          )}
          {status === 'processing' && (
            <button
              type="button"
              className="fd-btn fd-btn-primary fd-btn-lg"
              style={{ flex: 1 }}
              disabled={busy}
              onClick={() => onAdvance?.(order, 'out for delivery')}
            >
              Handed to rider
            </button>
          )}
          {status === 'out for delivery' && (
            <button
              type="button"
              className="fd-btn fd-btn-success fd-btn-lg"
              style={{ flex: 1 }}
              disabled={busy}
              onClick={() => onAdvance?.(order, 'delivered')}
            >
              Delivered
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default OrderDetailPanel
