import React, { useEffect, useRef, useState } from 'react'
import { CloseIcon } from './DineIcons'
import { optionErrors, rupees, unitPriceOf } from './cart'

/**
 * D6 — choosing a dish's portion, add-ons and a note before adding it.
 *
 * Variants are one-of (the till's portion choice); add-on groups carry their
 * own min/max, checked here the same way the server checks them, so a guest is
 * told about a missing choice before placing rather than after.
 */
const DineItemSheet = ({ item, onClose, onAdd }) => {
  const [variantId, setVariantId] = useState(item.variants[0]?.id || null)
  const [addonIds, setAddonIds] = useState([])
  const [note, setNote] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [tried, setTried] = useState(false)
  const closeRef = useRef(null)

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const variantIds = variantId ? [variantId] : []
  const errors = optionErrors(item, addonIds)
  const hasErrors = Object.keys(errors).length > 0
  const unit = unitPriceOf(item, variantIds, addonIds)

  const toggleAddon = (group, optionId) => {
    setAddonIds((prev) => {
      if (prev.includes(optionId)) return prev.filter((id) => id !== optionId)
      // A one-of group behaves like a radio: picking swaps the previous choice.
      if (group.max === 1) {
        const others = group.options.map((o) => o.id)
        return [...prev.filter((id) => !others.includes(id)), optionId]
      }
      return [...prev, optionId]
    })
  }

  const add = () => {
    setTried(true)
    if (hasErrors) return
    onAdd({ quantity, variantIds, addonIds, note })
  }

  return (
    <div className="dine-sheet-backdrop" onClick={onClose}>
      <div className="dine-sheet" role="dialog" aria-modal="true" aria-label={`${item.name} options`} onClick={(e) => e.stopPropagation()}>
        <div className="dine-sheet-grip"><span /></div>
        <div className="dine-sheet-head">
          <div className="dine-stack" style={{ gap: 4 }}>
            <h2 className="dine-display" style={{ fontSize: 24 }}>{item.name}</h2>
            {item.description && <div className="dine-small">{item.description}</div>}
          </div>
          <button type="button" ref={closeRef} className="dine-icon-btn" onClick={onClose} aria-label="Close"><CloseIcon /></button>
        </div>

        <div className="dine-sheet-body">
          {item.variants.length > 0 && (
            <fieldset className="dine-fieldset">
              <legend>Portion <span className="dine-small">· choose 1</span></legend>
              {item.variants.map((v) => (
                <label key={v.id} className={`dine-option ${variantId === v.id ? 'is-on' : ''}`}>
                  <input type="radio" name="variant" checked={variantId === v.id} onChange={() => setVariantId(v.id)} />
                  <span>{v.name}</span>
                  <span>{v.price > 0 ? `+${rupees(v.price)}` : ''}</span>
                </label>
              ))}
            </fieldset>
          )}

          {item.addonGroups.map((g) => {
            const picked = g.options.filter((o) => addonIds.includes(o.id)).length
            const full = g.max > 0 && picked >= g.max && g.max !== 1
            const rule = g.min > 0
              ? (g.max === g.min ? `choose ${g.min}` : `choose at least ${g.min}${g.max ? `, up to ${g.max}` : ''}`)
              : (g.max ? `up to ${g.max}` : 'optional')
            return (
              <fieldset key={g.id} className="dine-fieldset">
                <legend>{g.name} <span className="dine-small">· {rule}</span></legend>
                {g.options.map((o) => {
                  const on = addonIds.includes(o.id)
                  const disabled = !on && full
                  return (
                    <label key={o.id} className={`dine-option ${on ? 'is-on' : ''} ${disabled ? 'is-disabled' : ''}`}>
                      <input type={g.max === 1 ? 'radio' : 'checkbox'} name={`group-${g.id}`} checked={on} disabled={disabled} onChange={() => toggleAddon(g, o.id)} />
                      <span>{o.name}</span>
                      <span>{o.price > 0 ? `+${rupees(o.price)}` : ''}</span>
                    </label>
                  )
                })}
                {tried && errors[g.id] && <div className="dine-error" role="alert">{errors[g.id]}</div>}
              </fieldset>
            )
          })}

          <div className="dine-stack">
            <label className="dine-label" htmlFor="dine-note">Note for the kitchen</label>
            <input id="dine-note" className="dine-input" type="text" maxLength={140} placeholder="e.g. less spicy" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        <div className="dine-sheet-foot">
          <div className="dine-stepper is-light" style={{ height: 54 }}>
            <button type="button" aria-label="One less" onClick={() => setQuantity((q) => Math.max(1, q - 1))}>−</button>
            <span>{quantity}</span>
            <button type="button" aria-label="One more" onClick={() => setQuantity((q) => Math.min(50, q + 1))}>+</button>
          </div>
          <button type="button" className="dine-btn dine-btn-primary" style={{ minHeight: 54 }} onClick={add}>
            Add · {rupees(unit * quantity)}
          </button>
        </div>
      </div>
    </div>
  )
}

export default DineItemSheet
