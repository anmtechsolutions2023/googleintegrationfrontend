import React, { useMemo } from 'react'
import { tableStatusMeta } from './TableSelect'
import { buildTableRounds, formatRoundTime } from '../../utils/posRounds'
import { summarizeSession } from '../../utils/posBilling'
import './frontdesk.css'

/**
 * The room, as buttons.
 *
 * Billing cannot do anything until a table is chosen, and the screen used to
 * spend that time showing a dashed box pointing at a dropdown in the corner.
 * That is two interactions (open the list, pick from it) and no information. A
 * floor plan makes the same moment one tap and answers the questions a cashier
 * actually has on walking up: which tables are free, which are running, and how
 * big their bills are.
 *
 * Occupied tables carry their round count and running total, so "table 4 wants
 * to pay" can be found without opening anything.
 *
 * Presentational: it owns no state and fetches nothing.
 */

const money = (n) => (Number(n) || 0).toFixed(2)

const UNASSIGNED = '__unassigned__'

const FloorPlanPicker = ({
  floors = [], tables = [], orders = [], onPick, onPickCounter = null,
  onPickCounterOrder = null,
  title = 'Pick a table to start',
}) => {
  // A table's live session, priced from what each round already stored.
  const sessionByTable = useMemo(() => {
    const map = {}
    tables.forEach((t) => {
      const id = t.id || t.Id
      const rounds = buildTableRounds(orders, id)
      map[id] = rounds.length > 0
        ? {
          rounds: rounds.length,
          total: summarizeSession(rounds).total,
          // Every open round has had its bill printed: the guests have the
          // bill and the table is waiting on payment. A round added since has
          // no stamp, so the table reads as running again.
          printed: rounds.every((r) => !!r.order?.BillPrintedAt),
        }
        : null
    })
    return map
  }, [tables, orders])

  // Counter sales that were rung up but never paid for.
  //
  // A dine-in round is always recoverable: the table is the handle, and it sits
  // on the floor plan until the session is settled. A counter sale had NO
  // handle. Its id lived only in component state, so ordering a second one —
  // or reloading the page — orphaned the first: still open, food already made,
  // and no way back to it to take the money. It showed up afterwards only in
  // Reports, as a row saying "not billed yet" with nothing to click.
  //
  // Table-less and not closed is exactly that set, and it comes from the same
  // `orders` the floor plan is already given.
  const openCounterOrders = useMemo(() => {
    if (!onPickCounterOrder) return []
    return orders
      .filter((o) => !(o.TableId || o.tableId))
      .filter((o) => !/closed/i.test(String(o.Status || o.status || '')))
      .sort((a, b) => new Date(b.CreatedOn || 0) - new Date(a.CreatedOn || 0))
  }, [orders, onPickCounterOrder])

  // Grouped by floor, in the floor order the tenant configured. Tables with no
  // floor still have to be reachable, so they get a group of their own rather
  // than being dropped.
  const groups = useMemo(() => {
    const byFloor = new Map()
    tables.forEach((t) => {
      const key = t.FloorId || t.floorId || UNASSIGNED
      if (!byFloor.has(key)) byFloor.set(key, [])
      byFloor.get(key).push(t)
    })

    const named = floors
      .map((f) => ({ id: f.Id || f.id, name: f.Name || f.name }))
      .filter((f) => byFloor.has(f.id))
      .map((f) => ({ ...f, tables: byFloor.get(f.id) }))

    const loose = byFloor.get(UNASSIGNED)
    return loose ? [...named, { id: UNASSIGNED, name: 'Unassigned', tables: loose }] : named
  }, [floors, tables])

  // A counter-service outlet has no tables at all, so the counter has to be
  // reachable before this bails out — otherwise the till is unusable there.
  if (tables.length === 0 && !onPickCounter) {
    return (
      <div className="fd-floorplan is-empty">
        <span className="fd-floorplan-icon" aria-hidden="true">🪑</span>
        <strong>No tables set up yet</strong>
        <span>Add tables under Service → Floor → Tables before taking an order.</span>
      </div>
    )
  }

  // Takeaway ordered over the counter. It sits apart from the floor plan
  // because it is not a place in the room — there is no table to occupy, and
  // the customer is handed a token instead.
  const counterTile = (onPickCounter || openCounterOrders.length > 0) && (
    <section className="fd-floorplan-group" key="__counter__">
      <h3>Counter</h3>
      <div className="fd-floorplan-grid">
        {onPickCounter && (
          <button
            type="button"
            className="fd-tablecard fd-tablecard-counter"
            onClick={onPickCounter}
            aria-label="New counter takeaway, pay first then issue a token"
          >
            <span className="fd-tablecard-name">🎫 New sale</span>
            <span className="fd-tablecard-status">Takeaway</span>
            <span className="fd-tablecard-seats">Token issued on payment</span>
          </button>
        )}
        {/* Styled 'occupied' on purpose: an unpaid sale is money still owed,
            and it should read the same as a table that is still running. */}
        {openCounterOrders.map((o) => {
          const id = o.Id || o.id
          const no = o.OrderNo || o.orderNo || 'Order'
          const status = String(o.Status || o.status || 'open').toLowerCase()
          const placed = formatRoundTime(o.CreatedOn)
          return (
            <button
              type="button"
              key={id}
              className="fd-tablecard occupied"
              onClick={() => onPickCounterOrder(id)}
              aria-label={`${no}, takeaway, ${status}, ₹${money(o.Total)} unpaid${
                placed ? `, placed ${placed}` : ''
              }. Open it to take payment.`}
            >
              <span className="fd-tablecard-name">{no}</span>
              <span className="fd-tablecard-session">
                <span className="rounds">{status === 'fired' ? 'In kitchen' : 'Unpaid'}</span>
                <span className="total">₹{money(o.Total)}</span>
              </span>
              <span className="fd-tablecard-seats">{placed || 'Takeaway'}</span>
            </button>
          )
        })}
      </div>
    </section>
  )

  return (
    <div className="fd-floorplan">
      <div className="fd-floorplan-head">
        <h2>{title}</h2>
        <div className="fd-floorplan-legend" aria-hidden="true">
          <span><i className="dot free" /> Free</span>
          <span><i className="dot occupied" /> Running</span>
          <span><i className="dot printed" /> Bill printed</span>
          <span><i className="dot reserved" /> Reserved</span>
        </div>
      </div>


      {groups.map((g) => (
        <section className="fd-floorplan-group" key={g.id}>
          <h3>{g.name}</h3>
          <div className="fd-floorplan-grid">
            {g.tables.map((t) => {
              const id = t.id || t.Id
              const meta = tableStatusMeta(t)
              const session = sessionByTable[id]
              const seats = t.Capacity || t.capacity
              const statusKey = session?.printed ? 'printed' : meta.key
              const statusLabel = session?.printed ? 'Bill printed' : meta.label
              return (
                <button
                  type="button"
                  key={id}
                  className={`fd-tablecard ${statusKey}`}
                  onClick={() => onPick(id)}
                  // The status is colour-coded, and colour alone is not an
                  // answer for everyone — so it is in the label too.
                  aria-label={`${t.Name || t.name}, ${statusLabel}${
                    session ? `, ${session.rounds} rounds, ₹${money(session.total)} running` : ''
                  }`}
                >
                  <span className="fd-tablecard-name">{t.Name || t.name}</span>
                  {session ? (
                    <span className="fd-tablecard-session">
                      <span className="rounds">
                        {session.printed
                          ? 'Bill printed'
                          : `${session.rounds} ${session.rounds === 1 ? 'round' : 'rounds'}`}
                      </span>
                      <span className="total">₹{money(session.total)}</span>
                    </span>
                  ) : (
                    <span className="fd-tablecard-status">{meta.label}</span>
                  )}
                  {seats > 0 && <span className="fd-tablecard-seats">{seats} seats</span>}
                </button>
              )
            })}
          </div>
        </section>
      ))}

      {/* After the room, not before it: this screen is the floor plan, and a
          dine-in cashier should not have to look past the counter to find
          table 4. An outlet with no tables at all still gets it — that is the
          only thing they can sell through. */}
      {tables.length === 0 && (
        <div className="fd-floorplan-note">
          No tables set up yet — add them under Service → Floor → Tables to take a
          dine-in order.
        </div>
      )}
      {counterTile}
    </div>
  )
}

export default FloorPlanPicker
