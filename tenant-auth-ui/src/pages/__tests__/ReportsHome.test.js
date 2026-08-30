import React from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ReportsHome from '../ReportsHome'
import { SCOPES } from '../../constants'

// The page that replaced the stub. /reports used to render /api/reports, which
// returned the caller's own email, tenant id and scope list as "reports_data"
// and printed it as raw JSON — the only menu item named Reports was the one
// place with no reports in it.

jest.mock('../../context/AuthContext', () => ({ useAuth: jest.fn() }))
const { useAuth } = require('../../context/AuthContext')

const asUser = (scopes) => useAuth.mockReturnValue({ user: { tid: 't1', scopes } })

const show = () => render(
  <MemoryRouter><ReportsHome /></MemoryRouter>,
)

const cards = () => [...document.querySelectorAll('.rp-card-name')].map((e) => e.textContent)
const chip = (name) =>
  within(document.querySelector('.rp-chips'))
    .getByRole('button', { name: new RegExp(`^${name}\\s*\\d*$`) })

beforeEach(() => jest.clearAllMocks())

describe('what a user is offered', () => {
  test('an admin gets every report, grouped by the question it answers', () => {
    asUser([SCOPES.TENANT_ADMIN])
    show()
    expect(cards()).toHaveLength(24)
    // Each group name is deliberately in two places — a filter chip and the
    // heading it scrolls to — so headings are read as headings.
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(headings).toEqual([
      'Sales & revenue', 'Money & reconciliation', 'Returns & quality',
      'Customers', 'Campaigns', 'Operations', 'Assets', 'Documents & audit',
    ])
  })

  test('each card says what it answers, so nothing has to be clicked to find out', () => {
    asUser([SCOPES.TENANT_ADMIN])
    show()
    expect(screen.getByText(/Cash, card, UPI and portal settlement/i)).toBeInTheDocument()
  })

  test('a report opens the screen that owns it, with the tab already chosen', () => {
    // The catalogue links rather than re-renders: a second implementation of a
    // figure is one that can disagree with the first.
    asUser([SCOPES.TENANT_ADMIN])
    show()
    const link = screen.getByText('Tenders (Z-report)').closest('a')
    expect(link).toHaveAttribute('href', '/frontdesk/finance?tab=tenders')
  })

  test('a cashier sees only what their scopes reach', () => {
    asUser([SCOPES.POS_BILLING_READ])
    show()
    expect(cards()).toEqual(['Cash sessions'])
    // And no heading over an empty space.
    expect(screen.queryByRole('heading', { name: 'Sales & revenue' })).not.toBeInTheDocument()
  })

  test('someone with no reporting scope is told why, not shown an empty page', () => {
    asUser([])
    show()
    expect(screen.getByText(/No reports are available to your role/i)).toBeInTheDocument()
  })

  test('the count in the lead is what THIS user can open', () => {
    asUser([SCOPES.POS_BILLING_READ])
    show()
    expect(screen.getByText(/1 available to you/i)).toBeInTheDocument()
  })
})

describe('finding one', () => {
  beforeEach(() => { asUser([SCOPES.TENANT_ADMIN]) })

  test('search matches the words a manager actually types', () => {
    show()
    fireEvent.change(screen.getByLabelText('Search reports'), { target: { value: 'refund' } })
    expect(cards()).toEqual(expect.arrayContaining(['Return reasons', 'Returned products']))
    expect(cards()).not.toContain('Products')
  })

  test('a group chip narrows to that group', () => {
    show()
    fireEvent.click(chip('Returns & quality'))
    expect(cards()).toEqual(['Return reasons', 'Returned products'])
  })

  test('chips say which is on', () => {
    show()
    fireEvent.click(chip('Customers'))
    expect(chip('Customers')).toHaveAttribute('aria-pressed', 'true')
    expect(chip('All')).toHaveAttribute('aria-pressed', 'false')
  })

  test('a chip keeps showing its own size when selected', () => {
    // Counting under the group filter would make every other chip read zero.
    show()
    fireEvent.click(chip('Assets'))
    expect(chip('Customers').textContent).toContain('4')
  })

  test('nothing matching says so and offers the way back', () => {
    show()
    fireEvent.change(screen.getByLabelText('Search reports'), { target: { value: 'zzzz' } })
    expect(screen.getByText(/Nothing matches/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Clear/i }))
    expect(cards()).toHaveLength(24)
  })
})

describe('the reports that do not exist yet', () => {
  test('are listed, marked, and are not links', () => {
    // A catalogue that quietly omits what is missing cannot be used to decide
    // what to build next — but it must not pretend they are doors either.
    asUser([SCOPES.TENANT_ADMIN])
    show()
    const tokens = screen.getByText('Token queue').closest('.rp-card')
    expect(tokens.tagName).not.toBe('A')
    expect(within(tokens).getByText('Not built')).toBeInTheDocument()
    expect(within(tokens).getByText(/no screen reads it yet/i)).toBeInTheDocument()
  })
})
