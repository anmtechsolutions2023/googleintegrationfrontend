// src/utils/lineOptions.js
//
// One reading of an order line's options, add-ons, kitchen note and price
// breakdown — for every screen and every printout.
//
// A line reaches the UI in three spellings: a cart line (camelCase, built by
// Billing), an order round's Items snapshot (camelCase, priced by the server)
// and an invoice line (PascalCase columns from the ledger). Reading them in one
// place is what keeps the cart, the kitchen board, the order detail and the
// invoice from describing the same plate four different ways.

import { itemVariants } from './posRounds'

const num = (v) => Number(v) || 0
const money = (n) => num(n).toFixed(2)

const first = (obj, keys) => {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null) return obj[k]
  }
  return undefined
}

const parseList = (raw) => {
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

/** Mirrors the server's KITCHEN_NOTES limits. */
export const NOTE_MAX = 140
export const ORDER_NOTE_MAX = 500
export const NOTE_PRESETS_KEY = 'kitchen.note_presets'
/** One quick note, and how many a branch may keep — the server refuses more. */
export const PRESET_MAX = 40
export const PRESETS_MAX = 20
export const DEFAULT_NOTE_PRESETS = [
  'Less spicy', 'Extra spicy', 'Less salt', 'Less oil', 'No onion', 'No garlic', 'Jain',
]

/** The options (variants) on a line: [{ id, name, price }]. */
export const lineOptions = (line) => itemVariants(line)

/**
 * The add-ons on a line, WITH the group each came from: [{ id, name, price,
 * groupName }]. The group is what lets "Extra · Paneer" read as an extra rather
 * than as a paneer dish.
 */
export const lineAddons = (line) => parseList(first(line, ['addons', 'Addons']))
  .filter(Boolean)
  .map((a) => (typeof a === 'string'
    ? { id: a, name: a, price: 0, groupName: null }
    : {
      id: a.id ?? a.Id,
      name: a.name ?? a.Name ?? '',
      price: num(a.price ?? a.Price),
      groupName: a.groupName ?? a.GroupName ?? null,
    }))
  .filter((a) => a.name)

/**
 * The kitchen note on a line, or ''. Reads `notes` too, which is what a portal
 * order line calls it. Never `Comment`: on an invoice line that is the dish name.
 */
export const lineNote = (line) => {
  const raw = first(line, ['note', 'Note', 'notes', 'Notes'])
  return typeof raw === 'string' ? raw.trim() : ''
}

/**
 * What one plate cost, split: { base, options, extras, unit }. Null for a line
 * with no options and no add-ons — its rate needs no explaining.
 *
 * Stored amounts win over re-adding chip prices: the snapshot is what was
 * charged, and a chip price is only what the master said at the time.
 */
export const lineBreakdown = (line) => {
  const options = lineOptions(line)
  const addons = lineAddons(line)
  if (options.length === 0 && addons.length === 0) return null

  const variantAmount = first(line, ['variantAmount', 'VariantAmount'])
  const addonAmount = first(line, ['addonAmount', 'AddonAmount'])
  const optionsTotal = variantAmount !== undefined
    ? num(variantAmount)
    : options.reduce((sum, v) => sum + v.price, 0)
  const extrasTotal = addonAmount !== undefined
    ? num(addonAmount)
    : addons.reduce((sum, a) => sum + a.price, 0)

  const baseRaw = first(line, ['basePrice', 'BasePrice'])
  const unitRaw = first(line, ['price', 'UnitPrice', 'unitPrice', 'unitAmount'])
  let base
  if (baseRaw !== undefined) base = num(baseRaw)
  else if (unitRaw !== undefined) base = num(unitRaw) - optionsTotal - extrasTotal
  else return null

  return { base, options: optionsTotal, extras: extrasTotal, unit: base + optionsTotal + extrasTotal }
}

/** "₹239.00 + options ₹170.00 + extras ₹70.00" — the customise sheet's own wording. */
export const formatBreakdown = (b) => {
  if (!b) return ''
  return [
    `₹${money(b.base)}`,
    b.options > 0 ? `options ₹${money(b.options)}` : null,
    b.extras > 0 ? `extras ₹${money(b.extras)}` : null,
  ].filter(Boolean).join(' + ')
}

// ── Kitchen notes ───────────────────────────────────────────────────────────

/**
 * A branch's quick-pick notes from its settings value. A missing or unreadable
 * value falls back to the defaults; a saved empty list stays empty — that is
 * the branch choosing to type every note.
 */
export const parsePresets = (raw) => {
  if (raw === undefined || raw === null || raw === '') return DEFAULT_NOTE_PRESETS
  let list = raw
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw)
    } catch {
      return DEFAULT_NOTE_PRESETS
    }
  }
  if (!Array.isArray(list)) return DEFAULT_NOTE_PRESETS
  const seen = new Set()
  return list
    .map((p) => (typeof p === 'string' ? p.trim() : ''))
    .filter((p) => {
      const key = p.toLowerCase()
      if (!p || seen.has(key)) return false
      seen.add(key)
      return true
    })
}

// "Less spicy" and "Extra spicy" cannot both be true of one plate. Read from the
// words rather than a hand-kept list, so a branch's own "No onion" / "Extra
// onion" pair behaves the same way without configuration.
const DIRECTION = { less: -1, no: -1, without: -1, extra: 1, more: 1 }
const intentOf = (label) => {
  const m = String(label || '').trim().toLowerCase().match(/^(less|no|without|extra|more)\s+(.+)$/)
  return m ? { dir: DIRECTION[m[1]], subject: m[2] } : null
}

/** Do two quick notes ask for opposite things? */
export const conflictsWith = (a, b) => {
  const x = intentOf(a)
  const y = intentOf(b)
  return !!(x && y && x.subject === y.subject && x.dir !== y.dir)
}

const tokens = (note) => String(note || '').split(',').map((t) => t.trim()).filter(Boolean)

/**
 * A saved note back into { picks, text }: the parts that match a quick note,
 * and whatever was typed.
 */
export const splitNote = (note, presets = []) => {
  const byLower = new Map(presets.map((p) => [p.toLowerCase(), p]))
  const picks = []
  const rest = []
  tokens(note).forEach((t) => {
    const hit = byLower.get(t.toLowerCase())
    if (hit && !picks.includes(hit)) picks.push(hit)
    else rest.push(t)
  })
  return { picks, text: rest.join(', ') }
}

/** { picks, text } into the note that is saved — picks in the branch's order, then the text. */
export const composeNote = (picks = [], text = '', presets = []) => {
  const ordered = [
    ...presets.filter((p) => picks.includes(p)),
    ...picks.filter((p) => !presets.includes(p)),
  ]
  const typed = String(text || '').trim()
  return [...ordered, ...(typed ? [typed] : [])].join(', ')
}

/** Toggles one quick note, dropping any it contradicts. */
export const togglePick = (picks = [], label) => (picks.includes(label)
  ? picks.filter((p) => p !== label)
  : [...picks.filter((p) => !conflictsWith(p, label)), label])
