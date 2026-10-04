import React from 'react'
import { suggestTable, needsAttention } from '../../utils/tableSessions'
import './frontdesk.css'

const GUESTS_MAX = 99
const rupees = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`

/**
 * The order panel before a table is chosen.
 *
 * The board above the menu is where tables are picked; this is what the
 * empty panel offers beside it:
 *
 *   - Seat a walk-in: type the party size and it offers the smallest free
 *     table they fit, which the board outlines too. Seating it carries the
 *     party size onto the order as its guests.
 *   - Needs attention: bills out and tables running long, one tap each.
 *   - Takeaway, for the guest who turns out to be leaving.
 *
 * @param {Object} props
 * @param {Array<Object>} props.info - From tableInfo().
 * @param {Array<Object>} props.floors
 * @param {number} props.guests
 * @param {(n: number) => void} props.onGuests
 * @param {(tableId: string, guests: number) => void} props.onSeat
 * @param {(tableId: string) => void} props.onPick
 * @param {() => void} props.onTakeaway
 */
const TableStartPanel = ({ info = [], floors = [], guests, onGuests, onSeat, onPick, onTakeaway }) => {
  if (info.length === 0) {
    return (
      <p className="fd-tstart-empty">
        No tables set up yet. Add them under Outlet → Floors &amp; tables to take a
        dine-in order, or switch to Takeaway.
      </p>
    )
  }

  const suggestion = suggestTable(info, guests)
  const floorName = (id) => {
    const f = floors.find((x) => (x.Id || x.id) === id)
    return f ? (f.Name || f.name) : null
  }
  const attention = needsAttention(info).slice(0, 5)

  return (
    <div className="fd-tstart">
      <p className="fd-tstart-lede">
        Pick a table on the board to start an order. Dishes tapped first wait here
        until you do.
      </p>

      <div className="fd-tstart-walkin">
        <b>Seat a walk-in</b>
        <div className="fd-tstart-guests">
          <div className="fd-stepper">
            <button
              type="button"
              onClick={() => onGuests(Math.max(1, guests - 1))}
              disabled={guests <= 1}
              aria-label="One fewer guest"
            >
              −
            </button>
            <input
              id="fd-tstart-guests"
              type="number"
              inputMode="numeric"
              min={1}
              max={GUESTS_MAX}
              value={guests}
              aria-label="Guests in the party"
              onChange={(e) => {
                const n = Math.round(Number(e.target.value))
                if (n >= 1 && n <= GUESTS_MAX) onGuests(n)
              }}
            />
            <button
              type="button"
              onClick={() => onGuests(Math.min(GUESTS_MAX, guests + 1))}
              aria-label="One more guest"
            >
              +
            </button>
          </div>
          <span>{guests === 1 ? 'guest' : 'guests'} · smallest free table that fits</span>
        </div>
        {suggestion ? (
          <>
            <button
              type="button"
              className="fd-tstart-seat"
              onClick={() => onSeat(suggestion.table.id, guests)}
            >
              {[
                `Seat at ${suggestion.table.name}`,
                floorName(suggestion.table.floorId),
                suggestion.table.seats ? `${suggestion.table.seats} seats` : null,
              ].filter(Boolean).join(' · ')}
            </button>
            {!suggestion.fits && (
              <small className="fd-tstart-squeeze">
                No free table seats {guests}; this is the biggest free one.
              </small>
            )}
          </>
        ) : (
          <small className="fd-tstart-squeeze">Every table is taken right now.</small>
        )}
      </div>

      {attention.length > 0 && (
        <section className="fd-tstart-attn" aria-label="Needs attention">
          <h4>Needs attention</h4>
          {attention.map((x) => (
            <button
              type="button"
              key={x.id}
              className={x.key === 'bill' ? 'is-bill' : 'is-late'}
              onClick={() => onPick(x.id)}
            >
              {/* One text run, so the table's name appears once on screen as
                  a name — on its tile — and here as part of a sentence. */}
              {x.key === 'bill'
                ? `${x.name} · bill printed · ${rupees(x.total)}`
                : `${x.name} · ${x.age} · ${rupees(x.total)}`}
            </button>
          ))}
        </section>
      )}

      <button type="button" className="fd-link-btn fd-tstart-takeaway" onClick={onTakeaway}>
        Takeaway instead →
      </button>
    </div>
  )
}

export default TableStartPanel
