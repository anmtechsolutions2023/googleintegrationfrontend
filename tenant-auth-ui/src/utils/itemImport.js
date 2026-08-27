// src/utils/itemImport.js
//
// What a row of an item CSV means, and whether it can be read.
//
// WHY THIS IS ITS OWN MODULE
// Two screens read the same file: the Item Details import drawer, and step 3 of
// the first-time setup wizard. They must agree on every detail — which columns
// are required, what `CGST:2.5|SGST:2.5` means, which duplicate wins, what the
// template contains. A second copy of these rules is a second set of answers,
// and the one that drifts is always the one nobody is looking at.
//
// Nothing here touches the network. Parsing and checking a file is entirely a
// browser act; the wizard depends on that, because the bulk endpoint sits behind
// the first-time setup gate and cannot be called until the tenancy exists.

import { parseCsvToObjects } from './csv'

export const COLUMNS = ['name', 'category', 'unit', 'price', 'tax_group', 'tax_components',
  'food_type', 'code', 'description', 'tax_included']

// What a tax group is worth when the file does not say. Mirrors
// IMPORT.DEFAULT_TAX_COMPONENTS on the server — shown in the preview so the
// person sees it before it is applied, never after.
export const DEFAULT_TAX = 'CGST:2.5|SGST:2.5'

export const REQUIRED = ['name', 'category', 'unit', 'price', 'taxgroup']

export const TEMPLATE_ROWS = [
  ['Plain Tea', 'Tea', 'Glass', '15', 'GST 5%', DEFAULT_TAX, 'Veg', 'TEA-01', '', 'true'],
  ['Mango Lassi', 'Lassi', 'Glass', '80', 'GST 5%', DEFAULT_TAX, 'Veg', 'LAS-02', '', 'true'],
  // A non-veg row in the template, because that is the value that used to be
  // silently published as Veg.
  ['Chicken Roll', 'Snacks', 'Plate', '120', 'GST 5%', DEFAULT_TAX, 'Non-Veg', 'SNK-01', '', 'true'],
  // An 18% row, because a menu that sells packaged goods beside food needs a
  // second slab and the template is where people learn the column exists.
  ['Cold Brew Kit', 'Retail', 'Box', '1200', 'GST 18%', 'CGST:9|SGST:9', 'Veg', 'RET-01', '', 'true'],
]

/**
 * Read `CGST:2.5|SGST:2.5` into the shape the API takes.
 *
 * Stated rather than inferred from the group name: splitting 5% into CGST and
 * SGST is an Indian intra-state rule, not arithmetic, and a group called
 * "Standard" carries no rate at all. Inter-state is one `IGST:18`, not a split.
 *
 * @param {string} raw
 * @returns {{value?: Array, error?: string}}
 */
export const parseTaxComponents = (raw) => {
  const text = String(raw || '').trim()
  if (!text) return { value: [] }

  const parts = text.split('|').map((p) => p.trim()).filter(Boolean)
  const value = []
  for (const part of parts) {
    const [name, rate] = part.split(':').map((x) => (x || '').trim())
    if (!name || rate === undefined || rate === '') {
      return { error: `tax_components “${part}” should look like CGST:2.5` }
    }
    const num = Number(rate)
    if (Number.isNaN(num)) return { error: `tax rate “${rate}” is not a number` }
    value.push({ name, value: num })
  }
  return { value }
}

/**
 * Turn a parsed CSV row into the API's shape, or say why it cannot be.
 *
 * @param {Object} r - One object from parseCsvToObjects.
 * @returns {{value?: Object, error?: string}}
 */
export const validateRow = (r) => {
  const missing = REQUIRED.filter((k) => !r[k])
  if (missing.length) {
    return { error: `${missing.join(', ')} ${missing.length > 1 ? 'are' : 'is'} required` }
  }
  // Catches '1O9' — a letter O for a zero, the way a real spreadsheet fails.
  const price = Number(r.price)
  if (Number.isNaN(price)) return { error: `price “${r.price}” is not a number` }
  if (price < 0) return { error: 'price cannot be negative' }

  const tax = parseTaxComponents(r.taxcomponents)
  if (tax.error) return { error: tax.error }

  return {
    value: {
      name: r.name,
      category: r.category,
      unit: r.unit,
      price,
      taxGroup: r.taxgroup,
      taxComponents: tax.value,
      taxIncluded: String(r.taxincluded || 'true').toLowerCase() !== 'false',
      code: r.code || null,
      description: r.description || null,
      foodType: r.foodtype || null,
    },
  }
}

/**
 * The rates a group would end up with, given one row. The default is what makes
 * this worth stating: a row that names no rates is not a row with no tax.
 *
 * @param {Object} row - A validated row.
 * @returns {Array<{name: string, value: number}>}
 */
const ratesOf = (row) => (row.taxComponents.length
  ? row.taxComponents
  : DEFAULT_TAX.split('|').map((c) => {
    const [name, value] = c.split(':')
    return { name, value: Number(value) }
  }))

/** Order-independent identity for a set of rates — mirrors the server's. */
const rateSignature = (rates) => rates
  .map((c) => `${String(c.name).trim().toLowerCase()}:${Number(c.value)}`)
  .sort()
  .join('|')

/**
 * Read a whole file: which rows are usable, which are not, and what the usable
 * ones add up to.
 *
 * @param {string} text - Raw CSV.
 * @returns {{valid: Array, invalid: Array, fileErrors: Array, counts: Object|null}}
 */
export const checkFile = (text) => {
  const { rows, errors } = parseCsvToObjects(text)
  if (rows.length === 0) {
    return { valid: [], invalid: [], fileErrors: errors.length ? errors : ['That file has no rows'], counts: null }
  }

  const valid = []
  const invalid = []
  const seen = new Set()

  rows.forEach((r) => {
    const { value, error } = validateRow(r)
    if (error) { invalid.push({ line: r.__line, name: r.name || '—', error }); return }
    // A file that names the same drink twice would have the second row skip the
    // first — worth catching here rather than explaining afterwards.
    const key = value.name.toLowerCase()
    if (seen.has(key)) {
      invalid.push({ line: r.__line, name: value.name, error: 'This name appears twice in the file' })
      return
    }
    seen.add(key)
    valid.push({ line: r.__line, ...value })
  })

  return { valid, invalid, fileErrors: errors, counts: summarise(valid, invalid) }
}

/**
 * What the checked rows amount to, and what is worth warning about.
 *
 * @param {Array} valid
 * @param {Array} invalid
 * @returns {Object}
 */
export const summarise = (valid, invalid) => {
  const taxTypes = new Set()
  valid.forEach((v) => ratesOf(v).forEach((c) => taxTypes.add(String(c.name).toUpperCase())))

  // ── The conflict that used to be silent ──────────────────────────────────
  // A tax type is its NAME and its RATE together. A file that asks for CGST at
  // two different rates under two different group names is asking for two
  // different tax types, which is fine — but a file that gives ONE group two
  // different sets of rates is a contradiction the server refuses, and finding
  // that out mid-import means a half-written catalogue.
  const askedByGroup = new Map()
  const conflicts = []
  valid.forEach((v) => {
    const sig = rateSignature(ratesOf(v))
    const prev = askedByGroup.get(v.taxGroup)
    if (prev === undefined) { askedByGroup.set(v.taxGroup, sig); return }
    if (prev !== sig && !conflicts.includes(v.taxGroup)) conflicts.push(v.taxGroup)
  })

  return {
    valid: valid.length,
    invalid: invalid.length,
    categories: new Set(valid.map((v) => v.category.toLowerCase())).size,
    units: new Set(valid.map((v) => v.unit.toLowerCase())).size,
    taxGroups: askedByGroup.size,
    taxTypes: taxTypes.size,
    // Rows that will be given the standard split because they state none.
    defaulted: valid.filter((v) => v.taxComponents.length === 0).length,
    // Group names given two different sets of rates in one file.
    conflicts,
  }
}

/**
 * Browser-only download. This is the app, not a sandboxed page, so a blob link
 * works — it is how the template and the failed rows get back to a spreadsheet.
 *
 * @param {string} filename
 * @param {string} text
 */
export const download = (filename, text) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8;' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

const itemImport = {
  COLUMNS, DEFAULT_TAX, REQUIRED, TEMPLATE_ROWS,
  parseTaxComponents, validateRow, checkFile, summarise, download,
}

export default itemImport
