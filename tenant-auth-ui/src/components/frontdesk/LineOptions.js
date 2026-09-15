import React from 'react'
import {
  lineOptions, lineAddons, lineNote, lineBreakdown, formatBreakdown,
} from '../../utils/lineOptions'

const money = (n) => (Number(n) || 0).toFixed(2)

/** The speech-bubble that marks a kitchen note, wherever one appears. */
export const NoteIcon = ({ size = 10 }) => (
  <svg
    className="ci-note-icon"
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M3 3h10v7H7l-3 3v-3H3z" />
  </svg>
)

/**
 * What was chosen for one order line: options, add-ons (with their group), the
 * kitchen note, and optionally how the rate was built.
 *
 * One component for the cart, the rounds timeline, the kitchen board, the order
 * detail and the invoice, so a plate reads the same everywhere. Three colours,
 * each meaning one thing: indigo an option, green an add-on, amber a note.
 *
 * Renders nothing for a plain line, so callers need no guard.
 *
 * @param {Object} props
 * @param {Object} props.line - A cart line, an order Items entry or an invoice line.
 * @param {boolean} [props.showPrices=true] - "+₹170.00" on each chip.
 * @param {boolean} [props.showNote=true]
 * @param {boolean} [props.showBreakdown=false] - "₹239.00 + options ₹170.00 + extras ₹70.00".
 * @param {'chip'|'strong'} [props.noteStyle='chip'] - 'strong' is the kitchen's
 *   bold line: on the pass a note is an instruction, not a tag.
 */
const LineOptions = ({
  line, showPrices = true, showNote = true, showBreakdown = false, noteStyle = 'chip',
}) => {
  const options = lineOptions(line)
  const addons = lineAddons(line)
  const note = showNote ? lineNote(line) : ''
  const breakdown = showBreakdown ? lineBreakdown(line) : null
  if (options.length === 0 && addons.length === 0 && !note) return null

  return (
    <>
      {(options.length > 0 || addons.length > 0) && (
        <span className="ci-variants">
          {options.map((v, i) => (
            <span className="ci-variant-chip" key={v.id || `v${i}`}>
              {v.name}{showPrices && v.price > 0 ? ` +₹${money(v.price)}` : ''}
            </span>
          ))}
          {/* Tinted apart from options: the portion and the extra come from
              different masters, and only one of them changes what the dish is. */}
          {addons.map((a, i) => (
            <span className="ci-variant-chip is-addon" key={a.id || `a${i}`}>
              {a.groupName && <span className="ci-chip-group">{a.groupName} · </span>}
              {a.name}{showPrices && a.price > 0 ? ` +₹${money(a.price)}` : ''}
            </span>
          ))}
        </span>
      )}
      {note && (noteStyle === 'strong' ? (
        <span className="ci-note-strong">
          <NoteIcon size={12} />
          <span className="fd-sr-only">Kitchen note: </span>
          {note}
        </span>
      ) : (
        <span className="ci-variants">
          <span className="ci-variant-chip is-note" title="Kitchen note">
            <NoteIcon />
            <span className="fd-sr-only">Kitchen note: </span>
            {note}
          </span>
        </span>
      ))}
      {breakdown && <span className="ci-breakdown">{formatBreakdown(breakdown)}</span>}
    </>
  )
}

/**
 * What the customer asked of the WHOLE order, and whether they want cutlery.
 * Drawn under the dishes, the way the kitchen ticket prints it, on the order
 * detail and the kitchen board alike. Nothing when neither is set.
 *
 * @param {Object} props
 * @param {string} [props.instructions]
 * @param {boolean|number|string} [props.noCutlery] - The column is TINYINT, so 1 and "1" count.
 */
export const OrderInstructions = ({ instructions, noCutlery }) => {
  const text = typeof instructions === 'string' ? instructions.trim() : ''
  const cutlery = noCutlery === true || Number(noCutlery) === 1
  if (!text && !cutlery) return null
  return (
    <div className="fd-order-instr">
      <NoteIcon size={16} />
      <div className="fd-order-instr-body">
        <span className="fd-order-instr-label">Whole order</span>
        {text && <span>{text}</span>}
        {cutlery && <span className="fd-cutlery-flag">NO CUTLERY</span>}
      </div>
    </div>
  )
}

export default LineOptions
