// src/utils/receiptFields.js
//
// Whether one field appears on one printed document.
//
// Three states, not two — see the receipt catalogue on the server. The rule
// that matters is IF_PRESENT: a customer's name printed as "Customer: —" on
// every walk-in bill is as wrong as losing it for the customers who did give
// one, and no boolean can say so.
//
// This file deliberately holds NO copy of the field list or its defaults. Those
// live in the catalogue on the server and reach here as resolved values. What
// happens when the format could not be fetched is the ONE rule stated here:
// behave as if every field were IF_PRESENT — print what exists, skip what does
// not. A bill must still print when a settings call fails.

export const ALWAYS = 'always'
export const IF_PRESENT = 'if_present'
export const NEVER = 'never'

/** Is there anything here worth a line of paper? */
export const hasValue = (v) => {
  if (v === null || v === undefined) return false
  if (typeof v === 'string') return v.trim() !== ''
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === 'number') return v !== 0
  return Boolean(v)
}

/**
 * Should this field print?
 *
 * @param {Object|null} format - Resolved settings for ONE document type.
 * @param {string} key
 * @param {*} value - What would be printed. Only consulted for IF_PRESENT.
 * @returns {boolean}
 */
export const shows = (format, key, value) => {
  const state = format?.[key]
  // No format, or a field the server does not know: print it if there is
  // something to print. Never a blank labelled row.
  if (state === undefined || state === null || state === '') return hasValue(value)
  if (state === NEVER) return false
  if (state === ALWAYS) return true
  return hasValue(value)
}

/** An enum-valued setting, with a fallback for when nothing was resolved. */
export const choice = (format, key, fallback) => {
  const v = format?.[key]
  return v === undefined || v === null || v === '' ? fallback : v
}

/** Free text, trimmed. Blank prints nothing. */
export const line = (format, key) => String(format?.[key] || '').trim()

// A field that prints its VALUE needs one. `shows` answers whether the format
// wants the field; ALWAYS says yes even when the sale has nothing to put there,
// which is how a counter ticket printed "** NULL **", a bare "ROUND" and an
// "FSSAI" with no licence number. A labelled row can stand empty; a line made
// of the value alone cannot.
export const present = (format, key, value) => shows(format, key, value) && hasValue(value)

// ── How values are written on paper ─────────────────────────────────────────
// Shared by the screen receipt (Receipt.js) and the one sent to a Bluetooth
// printer (escposReceipt.js), so the two can never print a sale differently.

/** Two decimals and no symbol: a thermal printer has no rupee glyph. */
export const money = (n) => (Number(n) || 0).toFixed(2)

export const qty = (n) => {
  const v = Number(n) || 0
  return Number.isInteger(v) ? String(v) : v.toFixed(3).replace(/\.?0+$/, '')
}

/** A date as the format asks for it: 'datetime', 'date', 'time' or 'never'. */
export const dt = (value, mode) => {
  if (!value || mode === 'never') return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 16).replace('T', ' ')
  const date = d.toLocaleDateString('en-GB')
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  if (mode === 'date') return date
  if (mode === 'time') return time
  return `${date} ${time}`
}

/**
 * The masthead a document prints. An issued document carries the GSTIN it was
 * issued under, not whatever the branch holds today — a reprint must say what
 * the paper said. Anything without the snapshot (a preview, a token slip) takes
 * the branch's.
 */
export const printedShop = (shop = {}, data = {}) => (
  data && Object.prototype.hasOwnProperty.call(data, 'SellerGstin')
    ? { ...shop, gstin: data.SellerGstin || '' }
    // Never null: every body reads fields straight off it.
    : (shop || {})
)

const receiptFields = {
  ALWAYS, IF_PRESENT, NEVER, hasValue, shows, choice, line, present, money, qty, dt, printedShop,
}

export default receiptFields
