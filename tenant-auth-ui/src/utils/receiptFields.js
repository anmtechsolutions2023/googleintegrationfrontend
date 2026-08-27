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

const receiptFields = { ALWAYS, IF_PRESENT, NEVER, hasValue, shows, choice, line }

export default receiptFields
