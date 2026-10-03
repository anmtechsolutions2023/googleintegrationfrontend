import React, { useState } from 'react'
import {
  DEFAULT_NOTE_PRESETS, PRESET_MAX, PRESETS_MAX, conflictsWith,
} from '../../utils/lineOptions'

const Arrow = ({ up }) => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {up ? <path d="M7 11V3M3.5 6.5 7 3l3.5 3.5" /> : <path d="M7 3v8M3.5 7.5 7 11l3.5-3.5" />}
  </svg>
)
const Cross = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" aria-hidden="true" focusable="false">
    <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" />
  </svg>
)

const sameList = (a, b) => a.length === b.length && a.every((v, i) => v === b[i])

/**
 * The branch's quick-pick kitchen notes: reorder, remove, add.
 *
 * Every change saves straight away, the way every other POS setting on this
 * page does — there is no separate Save to forget. Reordering uses buttons
 * rather than drag, so it works with a keyboard and on a till's touchscreen.
 *
 * @param {Object} props
 * @param {string[]} props.value - The current list, in display order.
 * @param {boolean} [props.disabled]
 * @param {(list: string[]) => void} props.onSave
 */
const KitchenNotePresets = ({ value = [], disabled = false, onSave }) => {
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')

  const add = (e) => {
    e.preventDefault()
    const text = draft.replace(/\s+/g, ' ').trim()
    if (!text) { setError('Type a note to add.'); return }
    if (text.length > PRESET_MAX) { setError(`Keep a quick note to ${PRESET_MAX} characters.`); return }
    if (value.some((v) => v.toLowerCase() === text.toLowerCase())) {
      setError(`"${text}" is already on the list.`)
      return
    }
    if (value.length >= PRESETS_MAX) {
      setError(`A branch can keep ${PRESETS_MAX} quick notes. Remove one first.`)
      return
    }
    setError('')
    setDraft('')
    onSave([...value, text])
  }

  const move = (index, step) => {
    const to = index + step
    if (to < 0 || to >= value.length) return
    const next = [...value]
    ;[next[index], next[to]] = [next[to], next[index]]
    onSave(next)
  }

  return (
    <div className="fd-presets">
      {value.length === 0 ? (
        <p className="fd-setting-desc">No quick notes. Cashiers type every note.</p>
      ) : (
        <ol className="fd-preset-list" aria-label="Quick kitchen notes">
          {value.map((preset, i) => {
            const clash = value.find((other) => other !== preset && conflictsWith(other, preset))
            return (
              <li className="fd-preset-item" key={preset}>
                <span className="fd-preset-name">
                  {preset}
                  {clash && <em>Can&apos;t be picked together with {clash}</em>}
                </span>
                <span className="fd-preset-actions">
                  <button
                    type="button"
                    className="fd-icon-btn"
                    aria-label={`Move ${preset} up`}
                    disabled={disabled || i === 0}
                    onClick={() => move(i, -1)}
                  >
                    <Arrow up />
                  </button>
                  <button
                    type="button"
                    className="fd-icon-btn"
                    aria-label={`Move ${preset} down`}
                    disabled={disabled || i === value.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    <Arrow />
                  </button>
                  <button
                    type="button"
                    className="fd-icon-btn is-danger"
                    aria-label={`Remove ${preset}`}
                    disabled={disabled}
                    onClick={() => onSave(value.filter((_, k) => k !== i))}
                  >
                    <Cross />
                  </button>
                </span>
              </li>
            )
          })}
        </ol>
      )}

      <form className="fd-preset-add" onSubmit={add}>
        <input
          type="text"
          value={draft}
          maxLength={PRESET_MAX}
          placeholder="Add a quick note, e.g. Well done"
          aria-label="New quick note"
          disabled={disabled}
          onChange={(e) => { setDraft(e.target.value); if (error) setError('') }}
        />
        <button type="submit" className="fd-btn fd-btn-primary" disabled={disabled}>Add</button>
      </form>
      {error && <p className="fd-preset-error" role="alert">{error}</p>}

      <p className="fd-setting-desc fd-preset-foot">
        The first few show without scrolling on a phone, so put the most used at
        the top. Whether a note also prints on the guest&apos;s bill is set in
        Outlet → Receipt Format → Modifiers &amp; notes.
        {!sameList(value, DEFAULT_NOTE_PRESETS) && (
          <>
            {' '}
            <button
              type="button"
              className="fd-link-btn"
              disabled={disabled}
              onClick={() => onSave(DEFAULT_NOTE_PRESETS)}
            >
              Restore the suggested list
            </button>
          </>
        )}
      </p>
    </div>
  )
}

export default KitchenNotePresets
