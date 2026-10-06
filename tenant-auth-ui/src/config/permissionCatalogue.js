import { SCOPES } from '../constants/scopes'
import { WORKSPACES } from './workspaces'
import { SCREEN_WRITE_SCOPES } from './screenWriteScopes'

// Permissions, in the words of the rail.
//
// The database holds 32 feature rows ("POS_ORDER:WRITE" and the like). Every
// screen that shows them — the role editor, role comparison, the matrix, the
// access preview, a person's access summary and the Access Denied page — reads
// them through here, so one permission has one name everywhere. The names match
// the display_name the seed gives each feature (02-seed-data.sql); a feature
// added later without an entry here still shows, under a readable version of
// its own code.
//
// Each subject sits under the rail entry where it mostly lives. Some open
// screens elsewhere too (Menu & outlet setup also opens Outlet); `screensFor`
// lists them all, read from workspaces.js rather than written down twice.

export const PERMISSION_GROUPS = [
  { rail: 'Billing & KOT', subjects: [
    { key: 'POS_ORDER', name: 'Orders & KOTs' },
    { key: 'POS_BILLING', name: 'Bills & settlement',
      note: 'Includes any discount at settle; there is no limit.' },
  ] },
  { rail: 'Service', subjects: [
    { key: 'POS_KITCHEN', name: 'Kitchen display' },
    { key: 'POS_QR', name: 'QR ordering' },
    { key: 'POS_OPS', name: 'Counter, online orders & expenses' },
  ] },
  { rail: 'Menu', subjects: [
    { key: 'POS_CONFIG', name: 'Menu & outlet setup' },
    { key: 'INVENTORY', name: 'Stock & batches' },
    { key: 'MASTER_DATA', name: 'Lookup lists' },
  ] },
  { rail: 'Outlet', subjects: [
    { key: 'ORGANIZATION', name: 'Business & branches' },
    { key: 'PAYMENTS', name: 'Payment records & modes' },
  ] },
  { rail: 'Money', subjects: [
    { key: 'TRANSACTIONS', name: 'Ledger, returns & numbering',
      note: 'Also shows what was written off, and by whom, in Dues and Finance.' },
    { key: 'REFUND', name: 'Refunds & returns' },
    { key: 'EXPENSE', name: 'Expense approval' },
    { key: 'ASSET', name: 'Asset register' },
  ] },
  { rail: 'Guests', subjects: [
    { key: 'POS_CRM', name: 'Customers, loyalty & feedback' },
    { key: 'CUSTOMER', name: 'Customer data',
      note: 'Downloads every guest\'s name, mobile and email as a file.' },
  ] },
  { rail: 'Insights', subjects: [
    { key: 'POS_REPORTS', name: 'Front-desk reports' },
  ] },
  { rail: 'Admin', subjects: [
    { key: 'AUDIT', name: 'Audit trail' },
    { key: 'CONTACTS', name: 'Contacts & addresses' },
  ] },
]

export const LEVELS = ['READ', 'WRITE', 'APPROVE', 'EXPORT']
export const LEVEL_LABEL = { READ: 'View', WRITE: 'Manage', UPDATE: 'Manage', APPROVE: 'Approve', EXPORT: 'Export' }

const SUBJECT = Object.fromEntries(
  PERMISSION_GROUPS.flatMap((g) => g.subjects.map((s) => [s.key, { ...s, rail: g.rail }])),
)

/** "POS_KITCHEN_STAFF" → "Pos kitchen staff": a code that reads as words. */
const humanise = (code) => {
  const words = String(code || '').replace(/_/g, ' ').toLowerCase().trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : String(code || '')
}

/** A feature row's key: "POS_ORDER:WRITE". */
export const featureKey = (f) => `${f.feature_short_name}:${f.scope}`

/** The subject's display name: "POS_ORDER" → "Orders & KOTs". */
export const subjectName = (subject) => SUBJECT[subject]?.name || humanise(subject)

/** The rail a subject lives under, or 'Other' for one nobody has placed yet. */
export const railOf = (subject) => SUBJECT[subject]?.rail || 'Other'

/** A subject's caveat worth showing beside it ("no discount limit"). */
export const subjectNote = (subject) => SUBJECT[subject]?.note || null

/**
 * One scope in words: "POS_ORDER:WRITE" → "Orders & KOTs — Manage". The two
 * membership flags are not permissions at all, and say so.
 */
export const scopeLabel = (scope) => {
  if (scope === SCOPES.TENANT_ADMIN) return 'The Admin switch'
  if (scope === SCOPES.TENANT_SUPER_ADMIN) return 'Platform super admin'
  const [subject, level] = String(scope).split(':')
  if (!level) return humanise(scope)
  return `${subjectName(subject)} — ${LEVEL_LABEL[level] || humanise(level)}`
}

/**
 * Every screen a scope opens, as "Rail › Tab" or "Rail › Tab › Section", read
 * from the navigation config itself.
 */
export const screensFor = (scope) => {
  const out = []
  for (const ws of WORKSPACES) {
    for (const tab of ws.tabs) {
      if (tab.external) continue
      if (tab.sections) {
        for (const s of tab.sections) {
          if ((s.scopes || []).includes(scope)) out.push(`${ws.workspace} › ${tab.tabLabel || tab.label} › ${s.label}`)
        }
      } else if ((tab.scopes || []).includes(scope)) {
        out.push(ws.workspace === (tab.label) ? ws.workspace : `${ws.workspace} › ${tab.label}`)
      }
    }
  }
  return out
}

/** Every screen path → "Rail › Tab" or "Rail › Tab › Section". */
const screenNames = () => {
  const out = {}
  for (const ws of WORKSPACES) {
    for (const tab of ws.tabs) {
      if (tab.external) continue
      const tabName = tab.tabLabel || tab.label
      if (tab.sections) {
        for (const s of tab.sections) out[`${tab.path}/${s.key}`] = `${ws.workspace} › ${tabName} › ${s.label}`
      } else {
        out[tab.path] = ws.workspace === tabName ? ws.workspace : `${ws.workspace} › ${tabName}`
      }
    }
  }
  return out
}

/**
 * Screens where a scope is USED for an action without opening the screen
 * itself — REFUND:APPROVE is the Refund button on the Ledger and the settle
 * button on Returns, both of which open on TRANSACTIONS:READ.
 */
export const actionScreensFor = (scope) => {
  const names = screenNames()
  return Object.entries(SCREEN_WRITE_SCOPES)
    .filter(([, scopes]) => scopes.includes(scope))
    .map(([path]) => names[path])
    .filter(Boolean)
}

/**
 * The catalogue grouped by rail for an editor or matrix: each subject with the
 * feature row at each level it has (null where none exists — EXPENSE has only
 * APPROVE). Subjects the database has but this file does not place land in a
 * trailing "Other" group, so nothing is ever hidden.
 *
 * @param {Array} features - Feature rows from GET /api/admin/features.
 * @returns {Array<{ rail: string, subjects: Array<{ key, name, note, levels: Object }> }>}
 */
export const groupFeatures = (features = []) => {
  const bySubject = new Map()
  for (const f of features) {
    const s = f.feature_short_name
    if (!bySubject.has(s)) bySubject.set(s, {})
    bySubject.get(s)[f.scope] = f
  }
  const placed = new Set()
  const groups = PERMISSION_GROUPS.map((g) => ({
    rail: g.rail,
    subjects: g.subjects
      .filter((s) => bySubject.has(s.key))
      .map((s) => { placed.add(s.key); return { key: s.key, name: s.name, note: s.note || null, levels: bySubject.get(s.key) } }),
  })).filter((g) => g.subjects.length > 0)
  const other = [...bySubject.keys()].filter((k) => !placed.has(k)).sort()
  if (other.length) {
    groups.push({ rail: 'Other', subjects: other.map((k) => ({ key: k, name: humanise(k), note: null, levels: bySubject.get(k) })) })
  }
  return groups
}
