// src/utils/gstin.js
// GSTIN format and state codes. Mirrors src/utils/gstStates.js in the backend —
// the server is the authority and refuses a bad value either way; this copy is
// what lets a form say so while the person is still typing.

export const GST_STATES = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh',
  '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
  10: 'Bihar', 11: 'Sikkim', 12: 'Arunachal Pradesh', 13: 'Nagaland', 14: 'Manipur',
  15: 'Mizoram', 16: 'Tripura', 17: 'Meghalaya', 18: 'Assam', 19: 'West Bengal',
  20: 'Jharkhand', 21: 'Odisha', 22: 'Chhattisgarh', 23: 'Madhya Pradesh', 24: 'Gujarat',
  26: 'Dadra and Nagar Haveli and Daman and Diu', 27: 'Maharashtra', 29: 'Karnataka', 30: 'Goa',
  31: 'Lakshadweep', 32: 'Kerala', 33: 'Tamil Nadu', 34: 'Puducherry',
  35: 'Andaman and Nicobar Islands', 36: 'Telangana', 37: 'Andhra Pradesh', 38: 'Ladakh',
  97: 'Other Territory',
}

export const GSTIN_LENGTH = 15
export const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/
export const GSTIN_EXAMPLE = '29ABCDE1234F1Z5'

export const normaliseGstin = (value) => String(value ?? '').trim().toUpperCase()

/** The state a GSTIN is registered in, or null when it is not a valid GSTIN. */
export const stateOfGstin = (value) => {
  const g = normaliseGstin(value)
  if (!GSTIN_PATTERN.test(g)) return null
  return GST_STATES[g.slice(0, 2)] || null
}

/**
 * What is wrong with a GSTIN, in words a person can act on — or null when it is
 * fine. Blank is fine: every place that asks for one treats it as optional.
 */
export const gstinProblem = (value) => {
  const g = normaliseGstin(value)
  if (!g) return null
  if (g.length !== GSTIN_LENGTH) return `A GSTIN is ${GSTIN_LENGTH} characters — this has ${g.length}.`
  if (!GSTIN_PATTERN.test(g)) return `That is not a GSTIN. It looks like ${GSTIN_EXAMPLE}.`
  if (!GST_STATES[g.slice(0, 2)]) return `${g.slice(0, 2)} is not a GST state code.`
  return null
}
