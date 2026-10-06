// src/utils/menuFile.js
//
// Reading menu files in the browser, before anything is sent.
//
// Three kinds of file, told apart by their header rather than their name:
//   menu.csv   — one row per dish (name, category, price, …)
//   addons.csv — group, min, max, addon, price, …
//   hours.csv  — category, days, from, to
// The rows go to the server as the parser keys them (lower case, no spaces,
// underscores or hyphens), where the real rules run — see the backend's
// modules/menu/menu.import.js. This file only does what is useful BEFORE the
// server is asked: say which file is which, count what is in it, and flag rows
// that cannot possibly be dishes, so the person sees the shape of their file
// straight away.

import { parseCsvToObjects } from './csv'

/** Where the sample menu lives — public/samples, served with the app. */
export const SAMPLE_FILES = {
  menu: '/samples/menu-sample.csv',
  addons: '/samples/addons-sample.csv',
  hours: '/samples/hours-sample.csv',
}

/** Which kind of file a header row describes. */
export const kindOf = (headers = []) => {
  const keys = new Set(headers.map((h) => String(h).toLowerCase().replace(/[\s_-]/g, '')))
  if (keys.has('group') && keys.has('addon')) return 'addons'
  if (keys.has('category') && keys.has('days') && (keys.has('from') || keys.has('to'))) return 'hours'
  if (keys.has('name')) return 'menu'
  return null
}

const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim()
const list = (v) => String(v || '').split(';').map(clean).filter(Boolean)

/**
 * A menu file, checked as far as a browser can.
 *
 * @param {string} text
 * @returns {{kind: string|null, rows: Object[], valid: Object[], invalid: Object[], counts: Object|null, fileErrors: string[]}}
 */
export const readFile = (text) => {
  const { headers, rows, errors } = parseCsvToObjects(text)
  const kind = kindOf(headers)
  if (!rows.length) return { kind, rows: [], valid: [], invalid: [], counts: null, fileErrors: errors.length ? errors : ['That file has no rows'] }
  if (!kind) {
    return {
      kind, rows, valid: [], invalid: [], counts: null,
      fileErrors: ['This does not look like a menu, add-ons or hours file. A menu file needs at least a “name” column.'],
    }
  }
  if (kind !== 'menu') return { kind, rows, valid: rows, invalid: [], counts: { rows: rows.length }, fileErrors: errors }

  const valid = []
  const invalid = []
  rows.forEach((r) => {
    const name = clean(r.name)
    if (!name && !clean(r.code)) {
      invalid.push({ line: r.__line, name: '—', error: 'No name or code' })
      return
    }
    const price = String(r.price ?? '').trim()
    if (price && price !== '-' && !Number.isFinite(Number(price.replace(/[₹,\s]/g, '')))) {
      invalid.push({ line: r.__line, name: name || r.code, error: `Price “${price}” is not a number` })
      return
    }
    valid.push(r)
  })

  const distinct = (pick) => new Set(valid.flatMap(pick).map((x) => x.toLowerCase()).filter(Boolean)).size
  const portalKeys = Object.keys(valid[0] || {}).filter((k) => k.endsWith('listed')).map((k) => k.slice(0, -'listed'.length))
  return {
    kind,
    rows,
    valid,
    invalid,
    fileErrors: errors,
    counts: {
      dishes: valid.length,
      invalid: invalid.length,
      categories: distinct((r) => [clean(r.category)]),
      units: distinct((r) => [clean(r.unit || r.uom)]),
      taxGroups: distinct((r) => [clean(r.taxgroup)]),
      variants: distinct((r) => list(r.variants).map((v) => v.split('=')[0].trim())),
      tags: distinct((r) => list(r.tags)),
      hidden: valid.filter((r) => /^hid/i.test(clean(r.status))).length,
      portals: portalKeys.map((p) => ({ key: p, listed: valid.filter((r) => /^(y|yes|true|1)$/i.test(clean(r[`${p}listed`]))).length })),
    },
  }
}

/**
 * Several files at once (menu + add-ons + hours, in any order), sorted into
 * their kinds. A second file of the same kind replaces the first.
 *
 * @param {Array<{name: string, text: string}>} files
 */
export const readFiles = (files) => {
  const out = { menu: null, addons: null, hours: null, unknown: [] }
  files.forEach(({ name, text }) => {
    const read = readFile(text)
    if (!read.kind) out.unknown.push({ name, error: read.fileErrors[0] })
    else out[read.kind] = { name, ...read }
  })
  return out
}

/** The rows to send, as the server takes them. */
export const payloadOf = (sorted) => ({
  menu: sorted.menu ? sorted.menu.valid : [],
  addons: sorted.addons ? sorted.addons.rows : [],
  hours: sorted.hours ? sorted.hours.rows : [],
})

/** Fetches the sample menu that ships with the app. */
export const loadSample = async () => {
  const get = async (url) => {
    const res = await fetch(url, { cache: 'no-cache' })
    if (!res.ok) throw new Error(`Could not load ${url}`)
    return res.text()
  }
  const [menu, addons, hours] = await Promise.all([get(SAMPLE_FILES.menu), get(SAMPLE_FILES.addons), get(SAMPLE_FILES.hours)])
  return readFiles([
    { name: 'menu-sample.csv', text: menu },
    { name: 'addons-sample.csv', text: addons },
    { name: 'hours-sample.csv', text: hours },
  ])
}

/** Reads File objects (from an <input type=file multiple>) as text. */
export const readBrowserFiles = (fileList) => Promise.all([...fileList].map((file) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve({ name: file.name, text: String(reader.result) })
  reader.onerror = () => reject(new Error(`Could not read ${file.name}`))
  reader.readAsText(file)
})))

const menuFile = { SAMPLE_FILES, kindOf, readFile, readFiles, payloadOf, loadSample, readBrowserFiles }
export default menuFile
