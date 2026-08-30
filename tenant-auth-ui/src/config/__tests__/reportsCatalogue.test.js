import {
  REPORT_GROUPS, ALL_REPORTS, canSee, visibleGroups, matchesQuery,
} from '../reportsCatalogue'
import { SCOPES } from '../../constants'

// The catalogue is the one list of what reports exist. These pin the two things
// that make it trustworthy: it reaches everything, and it never offers a door
// somebody cannot walk through.

describe('the catalogue is complete', () => {
  test('covers every report the app has', () => {
    expect(ALL_REPORTS).toHaveLength(24)
  })

  test('every report says what question it answers', () => {
    // A card with a name and no sentence is a link somebody has to click to
    // understand, which is what the catalogue exists to avoid.
    ALL_REPORTS.forEach((r) => {
      expect(r.name).toBeTruthy()
      expect(r.answers).toBeTruthy()
      expect(r.answers.length).toBeGreaterThan(12)
    })
  })

  test('keys are unique, so React and the search agree on identity', () => {
    const keys = ALL_REPORTS.map((r) => r.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  test('every report either goes somewhere or says why it does not', () => {
    ALL_REPORTS.forEach((r) => {
      expect(Boolean(r.to) !== Boolean(r.missing)).toBe(true)
    })
  })

  test('the reports that are not built are named, not hidden', () => {
    // A catalogue that quietly omits what is missing cannot be used to decide
    // what to build next.
    const missing = ALL_REPORTS.filter((r) => r.missing).map((r) => r.key)
    expect(missing).toEqual(['tokens', 'feedback'])
  })

  test('no link points at the stub the catalogue replaced', () => {
    ALL_REPORTS.filter((r) => r.to).forEach((r) => {
      expect(r.to).not.toBe('/reports')
    })
  })

  test('every group has a question for a name and at least one report', () => {
    REPORT_GROUPS.forEach((g) => {
      expect(g.name).toBeTruthy()
      expect(g.blurb).toBeTruthy()
      expect(g.reports.length).toBeGreaterThan(0)
    })
  })
})

describe('scopes are the data\'s own', () => {
  test('nothing is gated on the invented reports scope', () => {
    // reports:READ is defined by no feature in the seed, so a report gated on
    // it would be invisible to every role but tenant admin — which is exactly
    // what was wrong with the page this replaced.
    ALL_REPORTS.forEach((r) => {
      expect(r.scopes).not.toContain('reports:READ')
      expect(r.scopes).not.toContain('reports:WRITE')
    })
  })

  test('every report names at least one scope', () => {
    ALL_REPORTS.forEach((r) => expect(r.scopes.length).toBeGreaterThan(0))
  })

  test('a tenant admin sees everything', () => {
    const groups = visibleGroups([SCOPES.TENANT_ADMIN])
    const n = groups.reduce((acc, g) => acc + g.reports.length, 0)
    expect(n).toBe(ALL_REPORTS.length)
  })

  test('an accountant sees the ledger reports and not the POS-only ones', () => {
    const groups = visibleGroups([SCOPES.TRANSACTIONS_READ])
    const keys = groups.flatMap((g) => g.reports.map((r) => r.key))
    expect(keys).toEqual(expect.arrayContaining(['sales', 'tenders', 'ledger']))
    expect(keys).not.toContain('today')
    expect(keys).not.toContain('assets')
  })

  test('a cashier with only billing scope sees just the till report', () => {
    const groups = visibleGroups([SCOPES.POS_BILLING_READ])
    expect(groups.flatMap((g) => g.reports.map((r) => r.key))).toEqual(['cash-sessions'])
  })

  test('a group with nothing visible is dropped whole', () => {
    // Never a heading over an empty space.
    const groups = visibleGroups([SCOPES.ASSET_READ])
    expect(groups).toHaveLength(1)
    expect(groups[0].key).toBe('assets')
  })

  test('somebody with no scopes sees nothing at all', () => {
    expect(visibleGroups([])).toEqual([])
  })

  test('canSee needs only one of the listed scopes', () => {
    const r = { scopes: ['A', 'B'] }
    expect(canSee(r, ['B'])).toBe(true)
    expect(canSee(r, ['C'])).toBe(false)
  })
})

describe('search', () => {
  const find = (q) => ALL_REPORTS.filter((r) => matchesQuery(r, q)).map((r) => r.key)

  test('an empty query matches everything', () => {
    expect(find('')).toHaveLength(ALL_REPORTS.length)
    expect(find('   ')).toHaveLength(ALL_REPORTS.length)
  })

  test('matches the name', () => {
    expect(find('tender')).toContain('tenders')
  })

  test('matches what it ANSWERS, not just the title', () => {
    // Nobody searches for "Return reasons"; they search for the word in their
    // head. "refund" appears in no report NAME.
    expect(find('refund')).toEqual(
      expect.arrayContaining(['return-reasons', 'return-products', 'ledger']),
    )
    expect(find('seat')).toContain('venue')
    expect(find('variance')).toContain('cash-sessions')
  })

  test('matches the group, so "customers" finds the whole section', () => {
    expect(find('customers')).toEqual(
      expect.arrayContaining(['customers', 'visits', 'lapsed', 'loyalty']),
    )
  })

  test('is case insensitive', () => {
    expect(find('LEDGER')).toContain('ledger')
  })

  test('a query matching nothing returns nothing', () => {
    expect(find('zzzz')).toEqual([])
  })
})
