// src/utils/writeOffs.js
//
// The pieces Dues › Written off, its detail and Finance's Written off tab share:
// the periods the register offers, narrowing the list, and the CSV export.
//
// The server counts a write-off on the day it was WRITTEN OFF and sends every
// one in the window, so the list is narrowed here, in the browser — and only
// the list. Totals always describe the whole window, as on Dues: "₹1,305 this
// month" must not change because the list was narrowed to one reason.

import { businessDate } from './businessDate'

/**
 * The periods the register offers. "This month" and "Last month" are calendar
 * months, which the server's rolling presets are not, so they go as custom
 * ranges. "Last 7 days" is the server's rolling week, named for what it is.
 */
export const WRITE_OFF_PERIODS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Last 7 days' },
  { key: 'month', label: 'This month' },
  { key: 'lastMonth', label: 'Last month' },
  { key: 'custom', label: 'Custom' },
]

/** This calendar month so far, as the shared report query. */
export const thisMonthRange = (now = new Date()) => ({
  preset: 'custom',
  fromDate: businessDate(new Date(now.getFullYear(), now.getMonth(), 1)),
  toDate: businessDate(now),
})

/**
 * The report query for a period key.
 *
 * @param {string} key - One of WRITE_OFF_PERIODS.
 * @param {{fromDate?: string, toDate?: string}} [custom]
 * @returns {Object|null} null for a custom range that does not name both ends.
 */
export const writeOffRange = (key, custom = {}, now = new Date()) => {
  switch (key) {
    case 'today': return { preset: 'today' }
    case 'week': return { preset: 'week' }
    case 'lastMonth': return {
      preset: 'custom',
      fromDate: businessDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      toDate: businessDate(new Date(now.getFullYear(), now.getMonth(), 0)),
    }
    case 'custom':
      return custom.fromDate && custom.toDate
        ? { preset: 'custom', fromDate: custom.fromDate, toDate: custom.toDate }
        : null
    default: return thisMonthRange(now)
  }
}

/**
 * Whether a write-off survives the list's filters.
 *
 * @param {Object} doc - A register row.
 * @param {{reason?: string, by?: string, search?: string}} filters
 */
export const matchesWriteOff = (doc, { reason, by, search } = {}) => {
  if (reason && doc.Reason !== reason) return false
  if (by && doc.WrittenOffByKey !== by) return false
  const term = String(search || '').trim().toLowerCase()
  if (!term) return true
  return [doc.TransactionNo, doc.CustomerName, doc.CustomerMobile, doc.Note, doc.Source?.label]
    .some((v) => String(v || '').toLowerCase().includes(term))
}

/** Where the bill was served, as Dues names it: "Token 4", or the table. */
export const sourceLabel = (source) => {
  if (!source?.label) return null
  return source.kind === 'token' ? `Token ${source.label}` : source.label
}

const pad = (n) => String(n).padStart(2, '0')

/** "06/10 12:40" — the register's column, where the year is the window's. */
export const shortStamp = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** "06/10/2026 12:40" — the detail, where the moment stands alone. */
export const fullStamp = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** A bill date (YYYY-MM-DD, or an ISO stamp at midnight UTC) as DD/MM/YYYY. */
export const billDate = (d) => {
  if (!d) return '—'
  const [y, m, day] = String(d).slice(0, 10).split('-')
  return y && m && day ? `${day}/${m}/${y}` : String(d)
}

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`

/**
 * The register as CSV, for the accountant — the rows as filtered on screen.
 *
 * @param {Array} documents
 * @returns {string}
 */
export const writeOffsCsv = (documents = []) => {
  const head = [
    'Written off on', 'Invoice', 'Bill date', 'Customer', 'Mobile', 'Branch',
    'Bill', 'Paid', 'Written off', 'Reason', 'Note', 'Written off by',
  ]
  const body = documents.map((d) => [
    fullStamp(d.WrittenOffAt), d.TransactionNo, billDate(d.TransactionDate),
    d.CustomerName || 'Walk-in', d.CustomerMobile || '', d.BranchName || '',
    Number(d.GrossAmount || 0).toFixed(2), Number(d.Collected || 0).toFixed(2),
    Number(d.WrittenOff || 0).toFixed(2), d.ReasonLabel || d.Reason || '', d.Note || '',
    d.WrittenOffByName || '',
  ])
  return [head, ...body].map((line) => line.map(csvCell).join(',')).join('\n')
}

/** Hands a CSV to the browser as a file. */
export const downloadCsv = (filename, csv) => {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
