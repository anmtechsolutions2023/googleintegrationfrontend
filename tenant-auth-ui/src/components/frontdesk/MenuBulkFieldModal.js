import React, { useMemo, useState } from 'react'
import { isOnSale } from '../../utils/menuFilters'

/*
 * What a bulk change may touch, in the order a manager looks for it. Item,
 * Branch and Price are absent on purpose: each belongs to the item itself, so
 * setting one on many rows at once would make several dishes the same dish.
 */
const FIELDS = [
  { key: 'Active', label: 'Active', group: 'Selling', kind: 'toggle' },
  { key: 'ChannelIds', label: 'Channels', group: 'Selling', kind: 'list', ref: 'posChannel', noun: 'channel' },
  { key: 'FoodTypeId', label: 'Food Type', group: 'What it is', kind: 'one', ref: 'posFoodType' },
  { key: 'MeatTypeId', label: 'Meat Type', group: 'What it is', kind: 'one', ref: 'posMeatTypes', clearable: true },
  { key: 'TagIds', label: 'Menu Tags', group: 'What it is', kind: 'list', ref: 'posMenuTags', groupBy: 'TagType', noun: 'tag' },
  { key: 'VariantIds', label: 'Variants', group: 'Choices & kitchen', kind: 'list', ref: 'posVariant', noun: 'variant' },
  { key: 'AddonGroupIds', label: 'Add-on Groups', group: 'Choices & kitchen', kind: 'list', ref: 'posAddonGroups', noun: 'add-on group' },
  { key: 'PrepTimeMinutes', label: 'Prep Time (min)', group: 'Choices & kitchen', kind: 'number', max: 1440 },
  { key: 'ServesCount', label: 'Serves', group: 'Choices & kitchen', kind: 'number', max: 255 },
]
const GROUPS = [...new Set(FIELDS.map((f) => f.group))]
const MODES = [
  { id: 'add', label: 'Add to all' },
  { id: 'remove', label: 'Remove from all' },
  { id: 'replace', label: 'Replace' },
]
const TAG_TYPE_LABEL = { CATEGORY: 'COURSE', BEVERAGE: 'DRINK', CUISINE: 'CUISINE' }

const idOf = (row) => row?.Id || row?.id
const itemsText = (n) => `${n} item${n === 1 ? '' : 's'}`
const listNames = (names, max = 3) => (names.length <= max
  ? names.join(', ')
  : `${names.slice(0, max).join(', ')} and ${names.length - max} more`)

/**
 * Change one field on every selected menu item.
 *
 * Says what will actually happen before anything is saved — which dishes the
 * change reaches and which already have it — and sends only the dishes it
 * would change, so "Apply to 1 item" means exactly that.
 *
 * @param {Object} props
 * @param {Array<Object>} props.rows - The selected menu rows.
 * @param {Object} props.referenceData - Master lists keyed by reference name.
 * @param {boolean} [props.busy]
 * @param {() => void} props.onClose
 * @param {(ids: string[], changes: Object, summary: string) => void} props.onApply
 */
const MenuBulkFieldModal = ({ rows, referenceData = {}, busy = false, onClose, onApply }) => {
  const [fieldKey, setFieldKey] = useState('TagIds')
  const [mode, setMode] = useState('add')
  const [picked, setPicked] = useState([])
  const [one, setOne] = useState('')
  const [number, setNumber] = useState('')
  const [sale, setSale] = useState('off')

  const field = FIELDS.find((f) => f.key === fieldKey)
  const options = useMemo(() => (referenceData[field.ref] || []).map((o) => ({
    id: o.Id || o.id,
    name: o.Name || o.name || o.Type || String(o.Id || o.id),
    type: o.TagType || null,
  })), [referenceData, field.ref])
  const nameOf = (id) => options.find((o) => o.id === id)?.name || 'it'

  const chooseField = (key) => {
    setFieldKey(key)
    setMode('add')
    setPicked([])
    setOne('')
    setNumber('')
  }
  const togglePick = (id) => setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  // Which rows the change reaches, what to send, and the sentences explaining it.
  const plan = useMemo(() => {
    const n = rows.length
    const empty = { targets: [], changes: null, lines: [] }
    if (field.kind === 'toggle') {
      const want = sale === 'on'
      const targets = rows.filter((r) => isOnSale(r) !== want)
      const lines = [`Turns ${sale} ${targets.length} of ${itemsText(n)}.`]
      if (targets.length < n) lines.push(`${itemsText(n - targets.length)} ${n - targets.length === 1 ? 'is' : 'are'} already ${sale}.`)
      return { targets, changes: { Active: want }, lines }
    }
    if (field.kind === 'one') {
      if (!one) return empty
      const value = one === '__clear__' ? null : one
      const targets = rows.filter((r) => (r[field.key] ?? null) !== value)
      const label = value === null ? `Clears ${field.label}` : `Sets ${field.label} to ${nameOf(value)}`
      return { targets, changes: { [field.key]: value }, lines: [`${label} on ${targets.length} of ${itemsText(n)}.`] }
    }
    if (field.kind === 'number') {
      if (number === '') return empty
      const value = number === '__clear__' ? null : Number(number)
      if (value !== null && (!Number.isInteger(value) || value < 0 || value > field.max)) {
        return { ...empty, lines: [`Enter a whole number from 0 to ${field.max}.`] }
      }
      const targets = rows.filter((r) => (r[field.key] ?? null) !== value)
      const label = value === null ? `Clears ${field.label}` : `Sets ${field.label} to ${value}`
      return { targets, changes: { [field.key]: value }, lines: [`${label} on ${targets.length} of ${itemsText(n)}.`] }
    }
    // A list field.
    if (picked.length === 0 && mode !== 'replace') return empty
    const own = (r) => (Array.isArray(r[field.key]) ? r[field.key] : [])
    const inherited = (r) => (field.key === 'TagIds' && Array.isArray(r.CategoryTags)
      ? r.CategoryTags.map((t) => t.id) : [])
    const names = listNames(picked.map(nameOf))
    const lines = []
    let targets
    if (mode === 'add') {
      targets = rows.filter((r) => picked.some((id) => !own(r).includes(id) && !inherited(r).includes(id)))
      lines.push(`Adds ${names} to ${targets.length} of ${itemsText(n)}.`)
      const already = rows.filter((r) => !targets.includes(r))
      if (already.length) {
        lines.push(`${listNames(already.map((r) => r.ItemName || 'An item'))} already ${already.length === 1 ? 'has' : 'have'} ${picked.length === 1 ? 'it' : 'them'}.`)
      }
    } else if (mode === 'remove') {
      targets = rows.filter((r) => picked.some((id) => own(r).includes(id)))
      lines.push(`Removes ${names} from ${targets.length} of ${itemsText(n)}.`)
      if (rows.some((r) => picked.some((id) => inherited(r).includes(id) && !own(r).includes(id)))) {
        lines.push('A tag a dish gets from its category stays — change it under Menu → Categories & hours → Categories.')
      }
    } else {
      targets = rows
      lines.push(picked.length
        ? `Sets each item's own ${field.noun}s to exactly ${names}, on all ${itemsText(n)}.`
        : `Removes every ${field.noun} set on ${itemsText(n)}.`)
      if (field.key === 'TagIds') lines.push('Tags from a dish\'s category always stay.')
    }
    return { targets, changes: { [field.key]: { mode, ids: picked } }, lines }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, field, sale, one, number, mode, picked, options])

  const canApply = !busy && plan.changes && plan.targets.length > 0
  const apply = () => onApply(
    plan.targets.map(idOf),
    plan.changes,
    `${field.label} updated on ${itemsText(plan.targets.length)}`,
  )

  const tagGroups = field.groupBy
    ? [...new Set(options.map((o) => o.type || 'OTHER'))].map((type) => ({
      type, label: TAG_TYPE_LABEL[type] || type, options: options.filter((o) => (o.type || 'OTHER') === type),
    }))
    : [{ type: 'all', label: null, options }]

  return (
    <div className="fd-modal-overlay" onClick={() => !busy && onClose()}>
      <div
        className="fd-modal fd-bulk-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fd-bulk-field-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="fd-modal-header">
          <div className="fd-bulk-modal-title">
            <h3 id="fd-bulk-field-title">Change a field for {itemsText(rows.length)}</h3>
            <span>{listNames(rows.map((r) => r.ItemName || 'Unnamed item'))}</span>
          </div>
          <button type="button" className="fd-modal-close" onClick={onClose} aria-label="Close" disabled={busy}>✕</button>
        </div>

        <label className="fd-bulk-row">
          <span className="fd-bulk-label">Field</span>
          <select value={fieldKey} onChange={(e) => chooseField(e.target.value)}>
            {GROUPS.map((g) => (
              <optgroup key={g} label={g}>
                {FIELDS.filter((f) => f.group === g).map((f) => (
                  <option key={f.key} value={f.key}>{f.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        {field.kind === 'toggle' && (
          <div className="fd-bulk-row">
            <span className="fd-bulk-label">Set to</span>
            <div className="fd-bulk-seg" role="radiogroup" aria-label="Active">
              {['on', 'off'].map((v) => (
                <button key={v} type="button" role="radio" aria-checked={sale === v}
                  className={sale === v ? 'is-on' : ''} onClick={() => setSale(v)}>
                  {v === 'on' ? 'On sale' : 'Off'}
                </button>
              ))}
            </div>
          </div>
        )}

        {field.kind === 'one' && (
          <label className="fd-bulk-row">
            <span className="fd-bulk-label">Set to</span>
            <select value={one} onChange={(e) => setOne(e.target.value)}>
              <option value="">Choose…</option>
              {field.clearable && <option value="__clear__">None — clear it</option>}
              {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </label>
        )}

        {field.kind === 'number' && (
          <div className="fd-bulk-row">
            <label className="fd-bulk-label" htmlFor="fd-bulk-number">Set to</label>
            <div className="fd-bulk-number">
              <input
                id="fd-bulk-number"
                type="number"
                min={0}
                max={field.max}
                step={1}
                inputMode="numeric"
                value={number === '__clear__' ? '' : number}
                disabled={number === '__clear__'}
                onChange={(e) => setNumber(e.target.value)}
              />
              <label className="fd-bulk-check">
                <input
                  type="checkbox"
                  checked={number === '__clear__'}
                  onChange={(e) => setNumber(e.target.checked ? '__clear__' : '')}
                />
                Clear it instead
              </label>
            </div>
          </div>
        )}

        {field.kind === 'list' && (
          <>
            <div className="fd-bulk-row">
              <span className="fd-bulk-label">How</span>
              <div className="fd-bulk-seg" role="radiogroup" aria-label="How to change it">
                {MODES.map((m) => (
                  <button key={m.id} type="button" role="radio" aria-checked={mode === m.id}
                    className={mode === m.id ? 'is-on' : ''} onClick={() => setMode(m.id)}>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="fd-bulk-row" role="group" aria-label={field.label}>
              <span className="fd-bulk-label">{field.label}</span>
              {options.length === 0 ? (
                <span className="fd-bulk-empty">None set up yet.</span>
              ) : tagGroups.map((g) => (
                <div key={g.type} className="fd-bulk-options">
                  {g.label && <span className="fd-menu-filter-label">{g.label}</span>}
                  {g.options.map((o) => (
                    <button key={o.id} type="button" aria-pressed={picked.includes(o.id)}
                      className={`fd-chip${picked.includes(o.id) ? ' is-on' : ''}`} onClick={() => togglePick(o.id)}>
                      {o.name}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </>
        )}

        {plan.lines.length > 0 && (
          <div className="fd-bulk-preview" aria-live="polite">
            <span className="fd-bulk-label">What will change</span>
            {plan.lines.map((l) => <span key={l}>{l}</span>)}
          </div>
        )}

        <div className="fd-bulk-modal-actions">
          <button type="button" className="fd-btn fd-btn-outline" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="fd-btn fd-btn-primary" onClick={apply} disabled={!canApply}>
            {busy ? 'Saving…' : `Apply to ${itemsText(plan.targets.length)}`}
          </button>
        </div>
      </div>
    </div>
  )
}

export default MenuBulkFieldModal
