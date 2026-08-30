import { SCOPES } from '../constants'

/**
 * Every report in the application, in one list.
 *
 * WHY A CATALOGUE RATHER THAN A NEW SET OF SCREENS
 * The reports already exist and work — thirteen tabs in Finance, two in Returns,
 * and the rest on the screens that own the data. Rebuilding them under a new
 * route would mean two implementations of the same figure, and the one nobody
 * is looking at is the one that drifts. So this maps each report to where it
 * ALREADY lives, and Reports becomes the door: one place to find anything, with
 * the range carried through, and nothing duplicated.
 *
 * GROUPED BY THE QUESTION, NOT THE TABLE
 * A manager thinks "why are we refunding so much", not "which of these reads
 * transactionitemdetail". The groups below are questions.
 *
 * SCOPES ARE THE DATA'S OWN
 * There is deliberately no `reports:READ`. That scope was invented by the old
 * stub route, no feature in the seed defines it, so no role could ever hold it
 * and only a tenant admin ever saw the menu. Each report here is gated on the
 * scope its DATA already uses, so a manager sees exactly the reports they can
 * see the numbers for — with no new feature rows to provision.
 */

const T = SCOPES.TENANT_ADMIN
const LEDGER = [SCOPES.TRANSACTIONS_READ, T]
const POS = [SCOPES.POS_REPORTS_READ, T]

/** A Finance tab, opened with its range already applied. */
const finance = (tab) => `/frontdesk/finance?tab=${tab}`

export const REPORT_GROUPS = [
  {
    key: 'sales',
    name: 'Sales & revenue',
    blurb: 'What was sold, and for how much',
    reports: [
      { key: 'overview', name: 'Overview', answers: 'Invoiced against collected, and the net position', to: finance('overview'), scopes: LEDGER },
      { key: 'sales', name: 'Sales', answers: 'Revenue over time, grouped daily, weekly or monthly', to: finance('sales'), scopes: LEDGER },
      { key: 'products', name: 'Products', answers: 'Which dishes sold, by quantity and by value', to: finance('products'), scopes: LEDGER },
      { key: 'channels', name: 'Channels', answers: 'Dine-in against takeaway against each portal', to: finance('channels'), scopes: LEDGER },
      { key: 'venue', name: 'Floors & tables', answers: 'What each table earned, and what it earned per seat', to: finance('venue'), scopes: LEDGER },
      { key: 'discounts', name: 'Discounts', answers: 'What was given away, and on which dishes', to: finance('discounts'), scopes: LEDGER },
    ],
  },
  {
    key: 'money',
    name: 'Money & reconciliation',
    blurb: 'Where the money went, and whether it balances',
    reports: [
      { key: 'tenders', name: 'Tenders (Z-report)', answers: 'Cash, card, UPI and portal settlement, and the account each landed in', to: finance('tenders'), scopes: LEDGER },
      { key: 'cashflow', name: 'Cash flow', answers: 'Money in and money out, per account', to: finance('cashflow'), scopes: LEDGER },
      { key: 'pending', name: 'Outstanding', answers: 'Invoiced but not yet collected', to: finance('pending'), scopes: LEDGER },
      { key: 'expenses', name: 'Expenses', answers: 'Spend by category over the range', to: finance('expenses'), scopes: LEDGER },
      { key: 'cash-sessions', name: 'Cash sessions', answers: 'Counted against expected, per cashier shift, and the variance', to: '/frontdesk/cash-sessions', scopes: [SCOPES.POS_BILLING_READ, T] },
    ],
  },
  {
    key: 'returns',
    name: 'Returns & quality',
    blurb: 'What came back, and whose fault it was',
    reports: [
      { key: 'return-reasons', name: 'Return reasons', answers: 'Why goods came back and were refunded, and how much of it was our fault', to: '/frontdesk/returns', scopes: LEDGER },
      { key: 'return-products', name: 'Returned products', answers: 'Which dishes are returned and refunded most, as a rate of what sold', to: '/frontdesk/returns', scopes: LEDGER },
    ],
  },
  {
    key: 'customers',
    name: 'Customers',
    blurb: 'Who bought, how often, and who stopped',
    reports: [
      { key: 'customers', name: 'Customers', answers: 'Spend, visits and average order, per customer', to: finance('customers'), scopes: LEDGER },
      { key: 'visits', name: 'Visit pattern', answers: 'Which days and which hours they come', to: finance('visits'), scopes: LEDGER },
      { key: 'lapsed', name: 'Lapsed customers', answers: 'Regulars who have stopped coming, most valuable first', to: finance('customers'), scopes: LEDGER },
      { key: 'loyalty', name: 'Loyalty statement', answers: 'Every points movement, and the reason it moved', to: '/frontdesk/customers', scopes: [SCOPES.POS_CRM_READ, T] },
    ],
  },
  {
    key: 'campaigns',
    name: 'Campaigns',
    blurb: 'What a promotion cost, and what it returned',
    reports: [
      { key: 'campaign', name: 'Campaign performance', answers: 'Given away, redemptions, revenue on those bills, and cost per redemption', to: '/frontdesk/campaigns', scopes: [SCOPES.POS_CONFIG_READ, T] },
    ],
  },
  {
    key: 'operations',
    name: 'Operations',
    blurb: 'How the service itself ran',
    reports: [
      { key: 'today', name: 'Today', answers: 'Live counts: orders open, tables occupied, customers, feedback', to: '/frontdesk/reports', scopes: POS },
      // Both exist as data and neither has a screen. Listed rather than hidden:
      // a catalogue that quietly omits what is missing cannot be used to decide
      // what to build next.
      { key: 'tokens', name: 'Token queue', answers: 'Counter throughput and wait times', scopes: POS, missing: 'The API serves this; no screen reads it yet.' },
      { key: 'feedback', name: 'Feedback ratings', answers: 'Average rating over time, and by dish', scopes: [SCOPES.POS_CRM_READ, T], missing: 'Ratings are stored, but nothing aggregates them yet.' },
    ],
  },
  {
    key: 'assets',
    name: 'Assets',
    blurb: 'What the outlet owns',
    reports: [
      { key: 'assets', name: 'Asset register', answers: 'What is owned, at which branch, and what it cost', to: '/frontdesk/assets', scopes: [SCOPES.ASSET_READ, T] },
    ],
  },
  {
    key: 'documents',
    name: 'Documents & audit',
    blurb: 'The paper trail every figure lands on',
    reports: [
      { key: 'ledger', name: 'Ledger', answers: 'Every invoice, credit note, refund and expense — filterable and printable', to: '/frontdesk/ledger', scopes: LEDGER },
      { key: 'audit', name: 'Audit log', answers: 'Who did what, and when', to: '/audit', scopes: [SCOPES.AUDIT_READ, SCOPES.ADMIN_ACCESS, T] },
    ],
  },
]

/** Flat list — for search, counts and route resolution. */
export const ALL_REPORTS = REPORT_GROUPS.flatMap((g) =>
  g.reports.map((r) => ({ ...r, group: g.key, groupName: g.name })))

/** Does this user hold any of the scopes a report needs? */
export const canSee = (report, scopes = []) =>
  !report.scopes || report.scopes.some((s) => scopes.includes(s))

/**
 * The catalogue this user may actually open.
 *
 * Groups with nothing visible are dropped whole, so a cashier is never shown a
 * heading over an empty space.
 */
export const visibleGroups = (scopes = []) =>
  REPORT_GROUPS
    .map((g) => ({ ...g, reports: g.reports.filter((r) => canSee(r, scopes)) }))
    .filter((g) => g.reports.length > 0)

/** Name, what it answers, and its group — so "refund" finds Return reasons. */
export const matchesQuery = (report, query) => {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return true
  return [report.name, report.answers, report.groupName]
    .filter(Boolean)
    .some((s) => s.toLowerCase().includes(q))
}

const reportsCatalogue = {
  REPORT_GROUPS, ALL_REPORTS, canSee, visibleGroups, matchesQuery,
}

export default reportsCatalogue
