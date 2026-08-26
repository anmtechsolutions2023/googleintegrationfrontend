import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import posService from '../services/posService'

// The expo screen's data.
//
// ── Why this is a hook and not a page-level useEffect ───────────────────────
// Aggregators enforce an accept SLA measured in about two minutes. A queue that
// only refreshes when somebody remembers to click Refresh WILL drop orders, and
// the penalty is a rating hit and a suspended store. So the polling, the
// alerting and the "have I seen this one" bookkeeping are a unit, and they are
// the only stateful thing on the screen — everything else is derived.
//
// ── Transport is swappable on purpose ───────────────────────────────────────
// Ten seconds is right for a single branch and costs nothing. A tenant running
// forty branches on one screen is a different problem, and that is when SSE
// earns its complexity. Only `load` below would change.

const POLL_MS = 10_000

// The four stages that are still someone's problem. Delivered and cancelled
// orders are history and belong on the list screen, not the queue.
const LIVE_STATUSES = ['new', 'accepted', 'processing', 'out for delivery']

// How the queue groups. Order matters: this list IS the reading order on the
// screen, and it is by urgency rather than by portal, because staff work the
// queue by what needs doing — a Zomato and a Swiggy order both due in 40
// seconds belong next to each other.
export const QUEUE_GROUPS = [
  { key: 'new', label: 'Needs action', statuses: ['new'], tone: 'danger' },
  { key: 'kitchen', label: 'In kitchen', statuses: ['accepted'], tone: 'warning' },
  { key: 'ready', label: 'Ready / awaiting pickup', statuses: ['processing'], tone: 'success' },
  { key: 'out', label: 'Out for delivery', statuses: ['out for delivery'], tone: 'muted' },
]

const idOf = (o) => o?.id || o?.Id

/**
 * Seconds until an order breaches its promised time, or null when the portal
 * did not send one.
 *
 * Computed per render from PromisedOn and never stored: a countdown held in
 * state is a countdown that needs a timer to stay true, and a stale one on this
 * screen is worse than none.
 */
export const slaSecondsLeft = (order, now = Date.now()) => {
  if (!order?.PromisedOn) return null
  const due = new Date(order.PromisedOn).getTime()
  if (Number.isNaN(due)) return null
  return Math.round((due - now) / 1000)
}

/** Neutral, then amber, then red. Thresholds are on the card, not in a tooltip. */
export const slaTone = (seconds) => {
  if (seconds === null || seconds === undefined) return 'muted'
  if (seconds <= 30) return 'danger'
  if (seconds <= 60) return 'warning'
  return 'muted'
}

/**
 * @param {Object} options
 * @param {string} options.branchId
 * @param {boolean} options.ready - False while the caller still does not know
 *   WHICH branch to ask about. Without this the screen fires one request for
 *   "every branch", then throws the answer away and fires a second one the
 *   moment the branch list arrives — a wasted round trip, and a queue that
 *   blanks itself a beat after it first painted.
 */
const useOrderQueue = ({ branchId = '', pollMs = POLL_MS, ready = true } = {}) => {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  // Ids that have arrived since the operator last acknowledged. Drives the
  // banner and the sound. Deliberately NOT cleared by a refresh — a new order
  // that nobody has acknowledged is still new after the next poll.
  const [unacked, setUnacked] = useState([])

  // What we had last time, so an arrival can be told from a re-fetch. A ref, not
  // state: comparing against it must not itself cause a render.
  const seenRef = useRef(null)
  const mountedRef = useRef(true)

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!ready) return
    if (!silent) setLoading(true)
    try {
      const rows = await posService.getOnlineOrderQueue({
        ...(branchId ? { branchId } : {}),
        statuses: LIVE_STATUSES.join(','),
      })
      if (!mountedRef.current) return

      // First load establishes the baseline. Without this every order already
      // on the screen would alarm the moment somebody opened the page.
      const previous = seenRef.current
      const ids = rows.map(idOf).filter(Boolean)
      if (previous !== null) {
        const arrived = ids.filter((id) => !previous.has(id))
        if (arrived.length) setUnacked((prev) => [...new Set([...prev, ...arrived])])
      }
      seenRef.current = new Set(ids)

      setOrders(rows)
      setError(null)
      setLastUpdated(Date.now())
    } catch (err) {
      if (mountedRef.current) setError(err)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [branchId, ready])

  useEffect(() => {
    mountedRef.current = true
    // Changing branch is a different queue, so the arrival baseline resets with
    // it — otherwise every order at the new branch would read as "just arrived".
    seenRef.current = null
    setUnacked([])
    load()
    return () => { mountedRef.current = false }
  }, [load])

  useEffect(() => {
    if (!pollMs || !ready) return undefined
    const timer = setInterval(() => load({ silent: true }), pollMs)
    return () => clearInterval(timer)
  }, [load, pollMs, ready])

  const acknowledge = useCallback(() => setUnacked([]), [])

  // Derived, never stored — see the note on slaSecondsLeft.
  const groups = useMemo(() => QUEUE_GROUPS.map((group) => ({
    ...group,
    orders: orders.filter((o) => group.statuses.includes(String(o.Status || '').toLowerCase())),
  })), [orders])

  const unackedOrders = useMemo(
    () => orders.filter((o) => unacked.includes(idOf(o))),
    [orders, unacked],
  )

  return {
    orders,
    groups,
    loading,
    error,
    lastUpdated,
    unackedOrders,
    acknowledge,
    reload: load,
  }
}

export { LIVE_STATUSES, idOf }
export default useOrderQueue
