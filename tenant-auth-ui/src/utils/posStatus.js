// Canonical POS status vocabularies, mirroring the backend enums in
// config/constants.js (POS_TABLE_STATUSES / POS_ORDER_STATUSES / POS_KOT_STATUSES)
// and the DDL defaults ('free', 'open', 'pending').
//
// All lowercase, and every comparison must go through a lowercasing read. Mixed
// casing is what made the dashboard wrong: it compared `k.Status !== 'Ready'`
// with strict !== against a server that only ever wrote 'ready', so every KOT
// ever fired counted as pending, forever, and the number never came back down.

export const TABLE_STATUSES = ['free', 'occupied', 'reserved']
export const ORDER_STATUSES = ['open', 'fired', 'closed', 'cancelled']
export const KOT_STATUSES = ['pending', 'ready', 'cancelled']

// Normalizes any stored spelling to the canonical value for comparison.
export const normalizeStatus = (status) => String(status || '').trim().toLowerCase()

// Stored values are lowercase; humans read Title Case. Multi-word values keep
// their separators ('partially_paid' → 'Partially Paid').
export const statusLabel = (status) => {
  const s = normalizeStatus(status)
  if (!s) return '—'
  return s
    .split(/[\s_-]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

// A KOT the kitchen still owes. 'cancelled' is pulled; anything unset is a
// ticket that was written before Status had a default, and is still owed.
export const isKotPending = (kot) =>
  !['ready', 'cancelled'].includes(normalizeStatus(kot?.Status) || 'pending')
