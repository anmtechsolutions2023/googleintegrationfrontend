import React, { useState } from 'react'
import {
  NOTE_MAX, splitNote, composeNote, togglePick,
} from '../../utils/lineOptions'

const Check = () => (
  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M2.5 6.2 5 8.6 9.5 3.6" />
  </svg>
)

/**
 * Quick-pick chips plus a free-text box, composing ONE kitchen note for a dish.
 *
 * Owns its picks and text after mount — the parent keys it per line — because
 * re-deriving them from the composed string on every keystroke would swallow a
 * comma the moment it was typed.
 *
 * Opposites cancel: picking "Extra spicy" drops "Less spicy". The note never
 * grows past what the ticket holds; a pick that would overflow it is refused
 * and the counter says why.
 *
 * @param {Object} props
 * @param {string} [props.value] - The note to start from.
 * @param {string[]} props.presets - This branch's quick notes, in order.
 * @param {(note: string) => void} props.onChange - Called with the composed note.
 * @param {string} [props.label] - Accessible name for the group.
 * @param {boolean} [props.compact] - Smaller chips, for the cart.
 * @param {boolean} [props.autoFocus]
 */
const KitchenNoteEditor = ({
  value = '', presets = [], onChange, label = 'Kitchen note', compact = false, autoFocus = false,
}) => {
  const [state, setState] = useState(() => splitNote(value, presets))
  const [full, setFull] = useState(false)
  const composed = composeNote(state.picks, state.text, presets)

  const commit = (next) => {
    setState(next)
    onChange?.(composeNote(next.picks, next.text, presets))
  }

  const pick = (preset) => {
    const picks = togglePick(state.picks, preset)
    if (composeNote(picks, state.text, presets).length > NOTE_MAX) {
      setFull(true)
      return
    }
    setFull(false)
    commit({ ...state, picks })
  }

  const type = (e) => {
    let text = e.target.value
    // Clamp to what is left once the picks are counted, so the composed note
    // can never exceed the ticket's limit however it was built.
    while (text && composeNote(state.picks, text, presets).length > NOTE_MAX) {
      text = text.slice(0, -1)
    }
    setFull(false)
    commit({ ...state, text })
  }

  return (
    <div className={`fd-knote${compact ? ' is-compact' : ''}`}>
      {presets.length > 0 && (
        <div className="fd-knote-picks" role="group" aria-label={`${label}: quick picks`}>
          {presets.map((p) => {
            const on = state.picks.includes(p)
            return (
              <button
                type="button"
                key={p}
                className={`fd-knote-chip${on ? ' is-on' : ''}`}
                aria-pressed={on}
                onClick={() => pick(p)}
              >
                {on && <Check />}
                {p}
              </button>
            )
          })}
        </div>
      )}
      <input
        type="text"
        className="fd-knote-input"
        value={state.text}
        onChange={type}
        placeholder="Anything else, e.g. gravy on the side"
        aria-label={`${label}: anything else`}
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus={autoFocus}
      />
      <div className="fd-knote-meta">
        <span className={full ? 'is-full' : ''} role={full ? 'status' : undefined}>
          {full ? 'The note is full. Remove something to add that.' : 'Goes on the kitchen ticket. No charge.'}
        </span>
        <span className="fd-knote-count">{composed.length}/{NOTE_MAX}</span>
      </div>
    </div>
  )
}

export default KitchenNoteEditor
