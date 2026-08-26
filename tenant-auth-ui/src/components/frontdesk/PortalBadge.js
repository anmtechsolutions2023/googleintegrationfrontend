import React from 'react'

// How you tell a Zomato order from a Swiggy one at a glance.
//
// ── Everything here is DATA ──────────────────────────────────────────────────
// The colour and the monogram come from pos_portal.ColorHex / ShortCode, not
// from a lookup table in this file. Adding District tomorrow is one row in the
// portal master: no stylesheet edit, no `switch (platform)`, no new asset.
//
// ── Colour never carries the meaning alone ──────────────────────────────────
// The monogram and, wherever there is room, the name always ride with it. This
// screen is read by a colour-blind cashier, and on a counter tablet washed out
// under kitchen lights — a page that encodes "which portal" purely as a hue
// fails both.

// Falls back rather than rendering a hole: a portal seeded before colours
// existed, or a legacy row with no portal link at all, still has to be legible.
const FALLBACK_COLOR = '#7f8c8d'

const monogramOf = (portal) => {
  const explicit = (portal?.ShortCode || '').trim()
  if (explicit) return explicit.toUpperCase().slice(0, 2)
  const name = (portal?.PortalName || portal?.Name || portal?.Platform || '').trim()
  return name ? name.slice(0, 2).toUpperCase() : '??'
}

const colorOf = (portal) => portal?.ColorHex || FALLBACK_COLOR

/**
 * The monogram tile on its own — for tight rows where the name is elsewhere.
 * @param {Object} portal - Any row carrying ColorHex/ShortCode (an order, a portal).
 * @param {number} size - Square edge in px. 44 is the floor for a tap target;
 *   these are decorative and never tappable, so smaller is fine.
 */
export const PortalMonogram = ({ portal, size = 30 }) => (
  <div
    aria-hidden="true"
    style={{
      width: size,
      height: size,
      borderRadius: Math.max(4, Math.round(size / 6)),
      background: colorOf(portal),
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: Math.max(9, Math.round(size * 0.38)),
      fontWeight: 800,
      letterSpacing: '.02em',
      flexShrink: 0,
    }}
  >
    {monogramOf(portal)}
  </div>
)

/**
 * Monogram + name. The default way a portal is identified anywhere in the UI.
 */
const PortalBadge = ({ portal, size = 30, showName = true }) => {
  const name = portal?.PortalName || portal?.Name || portal?.Platform || 'Unknown portal'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
      <PortalMonogram portal={portal} size={size} />
      {showName && (
        // The accessible name lives here, so screen readers get the portal even
        // though the coloured tile is aria-hidden.
        <span style={{ fontWeight: 700, color: '#2c3e50', fontSize: 14 }}>{name}</span>
      )}
      {!showName && <span className="sr-only-portal">{name}</span>}
    </div>
  )
}

/** The colour rail an order card wears down its left edge. */
export const portalRailStyle = (portal) => ({
  borderLeft: `4px solid ${colorOf(portal)}`,
})

export { colorOf as portalColor, monogramOf as portalMonogram }
export default PortalBadge
