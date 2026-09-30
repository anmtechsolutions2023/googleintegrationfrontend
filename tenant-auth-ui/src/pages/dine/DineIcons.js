import React from 'react'

const base = {
  fill: 'none', stroke: 'currentColor', strokeWidth: 2,
  strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: 'false',
}

export const BackIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" {...base}><path d="M15 18l-6-6 6-6" /></svg>
)
export const CloseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" {...base}><path d="M6 6l12 12M18 6 6 18" /></svg>
)
export const CheckIcon = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth="2.4"><path d="M20 6 9 17l-5-5" /></svg>
)
export const InfoIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" {...base} style={{ flexShrink: 0, marginTop: 1 }}>
    <circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" />
  </svg>
)
export const ShieldIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" {...base} style={{ flexShrink: 0, marginTop: 1 }}>
    <path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" />
  </svg>
)
export const SearchIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" {...base}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
)
export const TableIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" {...base}><path d="M3 10h18M5 10v10M19 10v10M8 6h8" /></svg>
)

/** The veg / non-veg square every Indian menu prints. */
export const DietMark = ({ isVeg }) => {
  if (isVeg === null || isVeg === undefined) return null
  return (
    <span
      className={`dine-diet ${isVeg ? 'is-veg' : 'is-nonveg'}`}
      role="img"
      aria-label={isVeg ? 'Vegetarian' : 'Non-vegetarian'}
    />
  )
}
