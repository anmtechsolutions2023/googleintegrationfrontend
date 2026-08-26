import React from 'react'
import { PortalMonogram } from './PortalBadge'

// Live or paused, per portal, per branch — with the kill switch on it.
//
// This sits above everything else on the queue because it is the most
// consequential control on the screen: when the kitchen is underwater, going
// offline on one portal is the difference between a late order and a rating
// hit. It must never be more than one click away, and it must not need a
// manager (hence POS_OPS on the endpoint, not POS_CONFIG).

const minutesLeft = (pausedUntil) => {
  if (!pausedUntil) return null
  const ms = new Date(pausedUntil).getTime() - Date.now()
  if (Number.isNaN(ms) || ms <= 0) return null
  return Math.ceil(ms / 60000)
}

const PortalTile = ({ mapping, openCount, busy, canWrite, onToggle }) => {
  const online = !!mapping.IsOnline
  const remaining = online ? null : minutesLeft(mapping.PausedUntil)

  return (
    <div
      style={{
        flex: '1 1 240px',
        minWidth: 220,
        background: online ? '#fff' : '#f7f8fa',
        border: '1px solid #e1e5eb',
        borderLeft: `4px solid ${online ? (mapping.ColorHex || '#7f8c8d') : '#b2bec3'}`,
        borderRadius: 8,
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        boxShadow: '0 1px 3px rgba(0,0,0,.06)',
      }}
    >
      <PortalMonogram
        portal={online ? mapping : { ...mapping, ColorHex: '#9aa3b4' }}
        size={34}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: online ? '#2c3e50' : '#7f8c8d' }}>
          {mapping.PortalName}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%',
            background: online ? '#27ae60' : '#e67e22',
          }}
          />
          <span style={{
            fontSize: 11, fontWeight: 600, color: online ? '#1e8449' : '#e67e22',
          }}
          >
            {online ? 'Live' : 'Paused'}
          </span>
          {/* Advisory: it records when somebody MEANT to reopen. Nothing
              auto-resumes — a branch that went down for a power cut should not
              quietly start taking orders again on a timer. */}
          {remaining !== null && (
            <span style={{ fontSize: 11, color: '#7f8c8d' }}>· {remaining} min left</span>
          )}
          {online && openCount > 0 && (
            <span style={{ fontSize: 11, color: '#7f8c8d' }}>· {openCount} open</span>
          )}
        </div>
      </div>

      {canWrite && (
        <button
          type="button"
          className={`fd-btn ${online ? 'fd-btn-outline' : 'fd-btn-success'}`}
          style={{ marginLeft: 'auto', flexShrink: 0 }}
          disabled={busy}
          onClick={() => onToggle?.(mapping, !online)}
        >
          {online ? 'Pause' : 'Resume'}
        </button>
      )}
    </div>
  )
}

/**
 * @param {Array} mappings - pos_portal_branch rows for the selected branch,
 *   already carrying the portal's name and colour from the join.
 * @param {Object} openCounts - portalId → count of live orders.
 */
const PortalStrip = ({ mappings = [], openCounts = {}, busyId, canWrite, onToggle }) => {
  if (mappings.length === 0) {
    return (
      <div style={{
        background: '#fff', border: '1px solid #e1e5eb', borderRadius: 8,
        padding: '14px 16px', fontSize: 13, color: '#7f8c8d', lineHeight: 1.55,
      }}
      >
        No portals are mapped to this branch yet. Map one under{' '}
        <strong style={{ color: '#5a6c7d' }}>POS Config → Portals</strong> so its orders
        can find their way here.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      {mappings.map((m) => (
        <PortalTile
          key={m.id || m.Id}
          mapping={m}
          openCount={openCounts[m.PortalId] || 0}
          busy={busyId === (m.id || m.Id)}
          canWrite={canWrite}
          onToggle={onToggle}
        />
      ))}
    </div>
  )
}

export { minutesLeft }
export default PortalStrip
