// src/utils/dineSessionStore.js
// Where a guest's diner session and cart live on their phone.
//
// sessionStorage, keyed by the scanned QR token: closing the tab ends the
// session, and two tables scanned in one browser do not share a cart. It is a
// convenience only — the server re-checks the session on every request and a
// storage failure (private mode, blocked storage) just means verifying again.
//
// Deliberately separate from the staff `app_token` cookie: a staff member who
// scans a table's code on their own phone must not become a diner on the till,
// nor a diner become staff.

const KEY = (qrToken) => `dine:${qrToken}`

const read = (qrToken) => {
  try {
    return JSON.parse(window.sessionStorage.getItem(KEY(qrToken)) || '{}') || {}
  } catch {
    return {}
  }
}

const write = (qrToken, value) => {
  try {
    window.sessionStorage.setItem(KEY(qrToken), JSON.stringify(value))
  } catch {
    // Storage unavailable: the page still works for this visit.
  }
}

/** { token, expiresAt, customerName } or null when absent or expired. */
export const getSession = (qrToken) => {
  const { session } = read(qrToken)
  if (!session || !session.token) return null
  if (session.expiresAt && Date.now() > session.expiresAt) return null
  return session
}

export const saveSession = (qrToken, { token, expiresInSeconds, customerName }) => {
  write(qrToken, {
    ...read(qrToken),
    session: { token, customerName: customerName || null, expiresAt: Date.now() + expiresInSeconds * 1000 },
  })
}

/** Records the name a first-time guest gave, keeping the session's expiry. */
export const renameSession = (qrToken, customerName) => {
  const current = read(qrToken)
  if (!current.session) return
  write(qrToken, { ...current, session: { ...current.session, customerName: customerName || null } })
}

export const clearSession = (qrToken) => {
  const { cart } = read(qrToken)
  write(qrToken, cart ? { cart } : {})
}

export const getCart = (qrToken) => read(qrToken).cart || []

export const saveCart = (qrToken, cart) => write(qrToken, { ...read(qrToken), cart })
