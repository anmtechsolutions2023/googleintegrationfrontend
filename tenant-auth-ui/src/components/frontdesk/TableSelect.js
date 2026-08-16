import React, { useState, useRef, useEffect } from 'react'
import './frontdesk.css'

// Normalize a table's Status into an occupancy bucket + label, matching the
// colour code used by the Tables occupancy view (occupied=orange,
// reserved=grey, free=green).
export const tableStatusMeta = (t) => {
  const s = (t?.Status || '').toLowerCase()
  if (s === 'occupied') return { key: 'occupied', label: 'Occupied' }
  if (s === 'reserved') return { key: 'reserved', label: 'Reserved' }
  return { key: 'free', label: 'Free' }
}

// Custom (non-native) table picker so each option can carry a colour-coded
// status chip — native <option> styling isn't reliable across browsers.
const TableSelect = ({ tables, floors = [], value, onChange, placeholder = '— Select Table —' }) => {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  // "Floor Name - Table Name" (falls back to just the table name if unassigned)
  const tableLabel = (t) => {
    const floor = floors.find((f) => (f.id || f.Id) === t.FloorId)
    const floorName = floor ? (floor.Name || floor.name) : ''
    const name = t.Name || t.name
    return floorName ? `${floorName} - ${name}` : name
  }

  const selected = tables.find((t) => (t.id || t.Id) === value) || null
  const selMeta = selected ? tableStatusMeta(selected) : null

  const pick = (v) => { onChange(v); setOpen(false) }

  return (
    <div className="fd-tsel" ref={ref}>
      {/* A stable name. Without it the control announces itself as whatever is
          currently picked ("R4 Occupied"), so a screen-reader user hears a value
          with no idea what it selects — and the label changes out from under
          them on every choice. */}
      <button
        type="button"
        className="fd-tsel-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Table"
      >
        {selected ? (
          <span className={`fd-tsel-face ${selMeta.key}`}>
            <span className="fd-tsel-dot" />
            <span className="fd-tsel-name">{tableLabel(selected)}</span>
            <span className="fd-tsel-status">{selMeta.label}</span>
          </span>
        ) : (
          <span className="fd-tsel-placeholder">{placeholder}</span>
        )}
        <span className="fd-tsel-caret" aria-hidden="true">▾</span>
      </button>

      {open && (
        <ul className="fd-tsel-menu" role="listbox">
          <li className="fd-tsel-item clear" onClick={() => pick('')}>{placeholder}</li>
          {tables.map((t) => {
            const tid = t.id || t.Id
            const m = tableStatusMeta(t)
            return (
              <li
                key={tid}
                role="option"
                aria-selected={tid === value}
                className={`fd-tsel-item ${m.key} ${tid === value ? 'active' : ''}`}
                onClick={() => pick(tid)}
              >
                <span className="fd-tsel-dot" />
                <span className="fd-tsel-name">{tableLabel(t)}</span>
                <span className="fd-tsel-status">{m.label}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default TableSelect
