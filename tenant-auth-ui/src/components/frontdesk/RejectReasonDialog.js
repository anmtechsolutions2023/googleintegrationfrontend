import React, { useState } from 'react'

// Refusing an order needs a reason, and the portal requires a CODED one.
//
// Free text would be easier to build and useless twice over: the portal's API
// rejects it, and "why did we turn away 40 orders last week" — a question an
// owner asks and a rating depends on — cannot be answered by a column full of
// prose.

// Mirrors POS_ONLINE_ORDER_REJECT_REASONS on the server. Labels are what a
// cashier would say out loud; the values are what the API takes.
const REASONS = [
  { value: 'out_of_stock', label: 'Out of stock' },
  { value: 'item_unavailable', label: 'One item unavailable' },
  { value: 'kitchen_full', label: 'Kitchen is full' },
  { value: 'store_closed', label: 'Store is closed' },
  { value: 'unable_to_deliver', label: 'Cannot deliver there' },
  { value: 'other', label: 'Something else' },
]

const RejectReasonDialog = ({ order, busy, onCancel, onConfirm }) => {
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')

  if (!order) return null

  return (
    <div
      className="fd-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Reject order"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 400,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div style={{
        background: '#fff', borderRadius: 8, width: '100%', maxWidth: 440,
        boxShadow: '0 10px 40px rgba(0,0,0,.25)', overflow: 'hidden',
      }}
      >
        <div style={{ padding: '18px 20px', borderBottom: '1px solid #e1e5eb' }}>
          <h2 style={{ margin: 0, fontSize: 17, color: '#2c3e50' }}>
            Reject {order.PortalName || order.Platform} {order.ExternalRef ? `#${order.ExternalRef}` : ''}?
          </h2>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: '#7f8c8d', lineHeight: 1.5 }}>
            The customer is told, and the portal records the reason. This cannot be undone.
          </p>
        </div>

        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {REASONS.map((r) => (
            <label
              key={r.value}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                border: `1px solid ${reason === r.value ? '#0f3460' : '#e1e5eb'}`,
                background: reason === r.value ? '#f0f6fc' : '#fff',
                borderRadius: 6, cursor: 'pointer', fontSize: 13.5, color: '#2c3e50',
                // 44px is the floor for a tap target and this screen is used on
                // a counter tablet.
                minHeight: 44,
              }}
            >
              <input
                type="radio"
                name="reject-reason"
                value={r.value}
                checked={reason === r.value}
                onChange={() => setReason(r.value)}
                style={{ accentColor: '#0f3460' }}
              />
              {r.label}
            </label>
          ))}

          <label htmlFor="reject-note" style={{ fontSize: 12, color: '#5a6c7d', marginTop: 4 }}>
            Note (optional)
          </label>
          <input
            id="reject-note"
            type="text"
            value={note}
            maxLength={255}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Anything the next person should know"
            style={{
              padding: '9px 12px', border: '1px solid #d0d4da', borderRadius: 6,
              fontSize: 13, fontFamily: 'inherit', color: '#2c3e50',
            }}
          />
        </div>

        <div style={{
          padding: '13px 20px', borderTop: '1px solid #e1e5eb',
          display: 'flex', gap: 8, justifyContent: 'flex-end',
        }}
        >
          <button type="button" className="fd-btn fd-btn-outline" onClick={onCancel} disabled={busy}>
            Keep the order
          </button>
          <button
            type="button"
            className="fd-btn fd-btn-danger"
            // A reject with no reason is one the portal will refuse, so the
            // button stays off until there is one.
            disabled={!reason || busy}
            onClick={() => onConfirm?.({ Reason: reason, Note: note || undefined })}
          >
            {busy ? 'Rejecting…' : 'Reject order'}
          </button>
        </div>
      </div>
    </div>
  )
}

export { REASONS }
export default RejectReasonDialog
