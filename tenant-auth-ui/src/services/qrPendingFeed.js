// src/services/qrPendingFeed.js
//
// ONE poll of the QR review queue for the whole app.
//
// The queue is shown in three places that can be on screen together: the
// "N QR orders waiting" banner (on /billing and the floor screens), the
// till's QR tags on tables, and the QR inbox itself. Each used to poll
// GET /api/pos/qr/orders/pending on its own 15-second timer, so /billing
// and the inbox asked twice every 15 seconds for the whole shift.
//
// Now the first subscriber starts one timer, every subscriber gets the same
// list, and the last one to leave stops it. The timer also stops while the
// tab is hidden and catches up the moment it is shown again.

import qrService from './qrService'

export const POLL_MS = 15000

const listeners = new Set()
let latest = null
let timer = null
let inFlight = null

const hidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden'

const publish = (list) => {
  latest = list
  listeners.forEach((fn) => fn(list))
}

/** Ask now (one request even if several screens ask at once). */
export const refresh = () => {
  if (!inFlight) {
    inFlight = qrService.getPendingOrders()
      .then((list) => { publish(Array.isArray(list) ? list : []); return latest })
      .finally(() => { inFlight = null })
  }
  return inFlight
}

const start = () => {
  if (timer || hidden() || listeners.size === 0) return
  timer = setInterval(() => { refresh().catch(() => {}) }, POLL_MS)
}
const stop = () => { clearInterval(timer); timer = null }

const onVisibility = () => {
  if (hidden()) stop()
  else if (listeners.size) { refresh().catch(() => {}); start() }
}

/**
 * Receive the pending list now (if known) and on every poll.
 * @param {(list: Array) => void} fn
 * @returns {() => void} Unsubscribe.
 */
export const subscribe = (fn) => {
  listeners.add(fn)
  if (listeners.size === 1) {
    document.addEventListener('visibilitychange', onVisibility)
    refresh().catch(() => {})
    start()
  } else if (latest) {
    fn(latest)
  }
  return () => {
    listeners.delete(fn)
    if (listeners.size === 0) {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
      latest = null
    }
  }
}

/** Test seam. */
export const reset = () => { listeners.clear(); stop(); latest = null; inFlight = null }

const qrPendingFeed = { subscribe, refresh, reset, POLL_MS }
export default qrPendingFeed
