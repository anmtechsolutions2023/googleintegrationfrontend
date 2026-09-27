import React from 'react'

/**
 * The Restro OS mark: a cloche, with the steam above it and the pass beneath.
 *
 * WHY THIS IS A COMPONENT AND NOT AN IMAGE
 * It is drawn, not photographed — three shapes and two colours. As SVG it is
 * about a kilobyte, it is sharp on every display at every size, and the accent
 * can be changed in one place. A PNG would need a file per density and would go
 * soft on the one screen that matters most, a counter tablet at 2x.
 *
 * WHY IT EXISTS AT ALL
 * The mark was drawn inline on the sign-in screen and nowhere else, so the navbar
 * — every page after sign-in, including the dashboard — fell back to a 🏢 emoji
 * from STRINGS.app.logo. The product had a logo on the way in and a piece of
 * clip-art everywhere after it, and the emoji rendered differently on every
 * platform it landed on.
 *
 * THE TILE
 * `tile` draws the dark rounded square behind the mark. The dome is white, so it
 * needs one on a light surface and must NOT have one on a dark surface — the
 * navbar is already #1a202c and a tile there is a box drawn around nothing. The
 * default is bare; callers on light backgrounds ask for the tile.
 *
 * @param {Object} p
 * @param {number} [p.size=28] - Rendered edge, in px.
 * @param {boolean} [p.tile=false] - Draw the dark rounded background.
 * @param {string} [p.title] - Accessible name. Omit inside a label that already
 *   names the product, so a screen reader does not read "Restro OS" twice.
 */
const BrandMark = ({ size = 28, tile = false, title, className }) => (
  <svg
    className={className}
    // The mark is designed on a 32-unit grid. The tile needs the full square; the
    // bare mark is inset, so it is drawn on the same grid either way and the two
    // versions cannot drift apart.
    viewBox="0 0 32 32"
    width={size}
    height={size}
    role={title ? 'img' : 'presentation'}
    aria-label={title || undefined}
    aria-hidden={title ? undefined : true}
    focusable="false"
  >
    {tile && <rect width="32" height="32" rx="7" fill="#1a1a2e" />}
    {/* The pass: a counter the dish is set down on. Rounded, because it is a
        drawn line rather than an edge. */}
    <path d="M4 23h24" stroke="#4fc3f7" strokeWidth="2.2" strokeLinecap="round" fill="none" />
    {/* The cloche. A true semicircle — the arc's radius and its span agree, so it
        never looks squashed at small sizes. */}
    <path d="M6.5 22a9.5 9.5 0 0 1 19 0" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" />
    {/* Steam. */}
    <circle cx="16" cy="8.2" r="1.9" fill="#4fc3f7" />
  </svg>
)

export default BrandMark
