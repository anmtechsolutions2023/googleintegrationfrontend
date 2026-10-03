// What each table on the floor is doing right now, read from the open orders
// Billing already holds. Shared by the table picker in the order panel and the
// table strip above the dishes, so the two can never disagree about whether a
// table is running, how much it owes or how long it has been going.

import { buildTableRounds } from './posRounds'
import { summarizeSession } from './posBilling'

/** Past this, a running table's time is shown as late. */
export const LATE_MINUTES = 45

/**
 * The live session of every table that has one, keyed by table id.
 *
 * @param {Array<Object>} tables
 * @param {Array<Object>} orders - Open orders.
 * @returns {Object<string, {rounds: number, total: number, startedAt: string|null, printed: boolean}>}
 */
export const tableSessions = (tables, orders) => {
  const map = {}
  ;(tables || []).forEach((t) => {
    const id = t.id || t.Id
    const rounds = buildTableRounds(orders || [], id)
    if (rounds.length === 0) return
    map[id] = {
      rounds: rounds.length,
      total: summarizeSession(rounds).total,
      startedAt: rounds[0].time,
      // Every open round has had its bill printed: waiting on payment. A round
      // added since carries no stamp, so the table reads as running again.
      printed: rounds.every((r) => !!r.order?.BillPrintedAt),
    }
  })
  return map
}

/** Whole minutes from `from` to `now`, or null when the time cannot be read. */
export const minutesSince = (from, now) => {
  const t = new Date(from).getTime()
  if (!from || Number.isNaN(t)) return null
  return Math.max(0, Math.round((now.getTime() - t) / 60000))
}

/** "24m", "1h 05m", or '' when the time cannot be read. */
export const sinceLabel = (from, now) => {
  const mins = minutesSince(from, now)
  if (mins === null) return ''
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`
}

// "G1", "g-1" and "G 1" all find G-1: a cashier types what they see, minus
// the punctuation.
export const squashName = (s) => String(s || '').toLowerCase().replace(/[\s\-_.]/g, '')

const UNASSIGNED = '__unassigned__'
export { UNASSIGNED as UNASSIGNED_FLOOR }

/**
 * What every table is doing, one row per table, in floor-plan order.
 *
 * `key` is the state the board colours by: 'free', 'occ' (an order running),
 * 'bill' (every open round's bill printed — waiting on payment) or 'res'.
 *
 * @param {Array<Object>} tables
 * @param {Array<Object>} orders - Open orders.
 * @param {Date} now
 * @param {Set<string>} [qrTableIds] - Tables with a QR order waiting for review.
 * @returns {Array<Object>}
 */
export const tableInfo = (tables, orders, now, qrTableIds = new Set()) => {
  const sessions = tableSessions(tables, orders)
  return (tables || []).map((t) => {
    const id = t.id || t.Id
    const session = sessions[id]
    const status = String(t.Status || t.status || '').toLowerCase()
    const mins = session ? minutesSince(session.startedAt, now) : null
    let key = 'free'
    if (session) key = session.printed ? 'bill' : 'occ'
    else if (status === 'reserved') key = 'res'
    return {
      id,
      name: t.Name || t.name || 'Table',
      floorId: t.FloorId || t.floorId || UNASSIGNED,
      seats: Number(t.Capacity || t.capacity) || 0,
      key,
      total: session?.total || 0,
      rounds: session?.rounds || 0,
      mins,
      age: session ? sinceLabel(session.startedAt, now) : '',
      late: key === 'occ' && mins !== null && mins >= LATE_MINUTES,
      qr: qrTableIds.has(id),
    }
  })
}

/**
 * The table to offer a walk-in party: the smallest free table they fit, so a
 * couple is not put at the six-seater. Ties go to the first in floor-plan
 * order. A table with no seat count fits anyone — it was never told otherwise.
 *
 * When nothing free is big enough, the biggest free table, flagged as a
 * squeeze, so the host can still seat them and pull a chair over.
 *
 * @param {Array<Object>} info - From tableInfo.
 * @param {number} guests
 * @returns {{table: Object, fits: boolean}|null}
 */
export const suggestTable = (info, guests) => {
  const free = (info || []).filter((x) => x.key === 'free')
  if (free.length === 0) return null
  const n = Math.max(1, Number(guests) || 1)
  const fitting = free
    .filter((x) => !x.seats || x.seats >= n)
    .sort((a, b) => (a.seats || 1e9) - (b.seats || 1e9))
  if (fitting.length > 0) return { table: fitting[0], fits: true }
  const biggest = [...free].sort((a, b) => b.seats - a.seats)[0]
  return { table: biggest, fits: false }
}

/**
 * Tables that need someone: bills out (about to pay), then anything running
 * long, longest first.
 */
export const needsAttention = (info) => [
  ...(info || []).filter((x) => x.key === 'bill'),
  ...(info || []).filter((x) => x.late).sort((a, b) => (b.mins || 0) - (a.mins || 0)),
]
