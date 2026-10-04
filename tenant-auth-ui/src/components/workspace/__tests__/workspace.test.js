// The workspace shell, end to end through the router, with every screen
// stubbed: what matters here is WHERE a URL lands and WHAT the rail and tabs
// offer — not what each screen draws.

import React from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import { useAuth } from '../../../context/AuthContext'
import WorkspaceLayout from '../WorkspaceLayout'
import { workspaceRoutes, movedRoutes } from '../workspaceRoutes'
import { LegacyRedirect, HomeRedirect } from '../WorkspaceRedirects'

jest.mock('../../../context/AuthContext', () => ({ useAuth: jest.fn() }))
jest.mock('../../../context/FrontDeskContext', () => ({ FrontDeskProvider: ({ children }) => children }))
jest.mock('../../frontdesk/OrderLinkProvider', () => ({ OrderLinkProvider: ({ children }) => children }))
jest.mock('../../frontdesk/QrOrderAlert', () => () => require('react').createElement('div', null, 'QR alert'))
jest.mock('../../../pages/NotFound', () => () => require('react').createElement('div', null, 'Not found'))
jest.mock('../../../config/workspaceScreens', () => {
  const h = require('react').createElement
  return {
    screenFor: (key) => h('div', null, `screen:${key}`),
    NESTED_SCREENS: { 'guests.offers': [{ path: ':id', element: h('div', null, 'campaign detail') }] },
  }
})
// A refused ScopeGuard renders nothing recognisable; stub it to say so.
jest.mock('../../Guards', () => {
  const { hasScope } = jest.requireActual('../../../utils/permissions')
  const { useAuth: use } = jest.requireMock('../../../context/AuthContext')
  return {
    ScopeGuard: ({ requiredScopes, children }) => (
      hasScope(use().user, requiredScopes) ? children : require('react').createElement('div', null, 'forbidden')
    ),
  }
})

const Where = () => <div data-testid="where">{useLocation().pathname}{useLocation().search}</div>

const renderAt = (path, scopes) => {
  useAuth.mockReturnValue({ user: { tid: 't', onboardingStatus: 'APPROVED', setupCompleted: true, scopes } })
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<WorkspaceLayout />}>{workspaceRoutes()}</Route>
        <Route path="/dashboard" element={<HomeRedirect fallback={<div>home page</div>} />} />
        <Route path="/frontdesk/*" element={<LegacyRedirect />} />
        <Route path="/master/*" element={<LegacyRedirect />} />
        {movedRoutes()}
      </Routes>
      <Where />
    </MemoryRouter>,
  )
}

test('the rail shows only the workspaces a cashier can open', () => {
  renderAt('/billing', ['POS_ORDER:READ', 'POS_CRM:READ'])
  const rail = screen.getByRole('navigation', { name: 'Workspaces' })
  expect(rail).toHaveTextContent('Billing & KOT')
  expect(rail).toHaveTextContent('Service')
  expect(rail).toHaveTextContent('Guests')
  expect(rail).not.toHaveTextContent('Money')
  expect(rail).not.toHaveTextContent('Admin')
})

test('a sectioned tab shows its sections and the banner above them', () => {
  renderAt('/service/floor/tables', ['TENANT:ADMIN'])
  expect(screen.getByText('screen:service.floor.tables')).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: 'Tables' })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: 'QR inbox' })).toBeInTheDocument()
  expect(screen.queryByRole('tab', { name: 'Billing & KOT' })).not.toBeInTheDocument()
  expect(screen.getByText('QR alert')).toBeInTheDocument()
})

// The till is its own rail entry: lit there, with no workspace title, tabs or
// section pills above it — but still the QR banner, as it had under Floor.
test('the till opens bare, with the QR banner and nothing else above it', () => {
  renderAt('/billing', ['TENANT:ADMIN'])
  expect(screen.getByText('screen:billing.till')).toBeInTheDocument()
  expect(screen.getByText('QR alert')).toBeInTheDocument()
  expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
  expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  const till = screen.getByRole('link', { name: 'Billing & KOT' })
  expect(till).toHaveAttribute('aria-current', 'page')
  expect(till).toHaveAttribute('href', '/billing')
})

test('the old Service › Floor › Billing & KOT address forwards to the till', () => {
  renderAt('/service/floor/order?table=t1', ['TENANT:ADMIN'])
  expect(screen.getByTestId('where')).toHaveTextContent('/billing?table=t1')
  expect(screen.getByText('screen:billing.till')).toBeInTheDocument()
})

test('an old Front Desk billing link forwards to the till', () => {
  renderAt('/frontdesk/billing', ['POS_ORDER:READ'])
  expect(screen.getByTestId('where')).toHaveTextContent('/billing')
})

test('Home sends floor staff to the till', () => {
  renderAt('/dashboard', ['POS_ORDER:READ'])
  expect(screen.getByTestId('where')).toHaveTextContent('/billing')
})

test('opening a tab lands on the first section this user may open', () => {
  renderAt('/service/floor', ['POS_QR:READ'])
  expect(screen.getByTestId('where')).toHaveTextContent('/service/floor/qr')
})

test('a section the user may not open is refused by its guard', () => {
  renderAt('/money/ledger', ['POS_ORDER:READ'])
  expect(screen.getByText('forbidden')).toBeInTheDocument()
})

test('an old Front Desk link forwards, keeping the query', () => {
  renderAt('/frontdesk/finance?tab=gst', ['TENANT:ADMIN'])
  expect(screen.getByTestId('where')).toHaveTextContent('/money/overview?tab=gst')
  expect(screen.getByText('screen:money.overview')).toBeInTheDocument()
})

test('an old link to a record forwards to its nested page', () => {
  renderAt('/frontdesk/campaigns/c-9', ['TENANT:ADMIN'])
  expect(screen.getByText('campaign detail')).toBeInTheDocument()
})

test('an old Master Data grid forwards into Admin › Data tables', () => {
  renderAt('/master/taxTypes', ['TENANT:ADMIN'])
  expect(screen.getByTestId('where')).toHaveTextContent('/org/data/taxTypes')
})

test('Home forwards to the first workspace the user can open', () => {
  renderAt('/dashboard', ['TRANSACTIONS:READ'])
  expect(screen.getByTestId('where').textContent.startsWith('/money/overview')).toBe(true)
})

test('an unknown old address is a 404, not a guess', () => {
  renderAt('/frontdesk/nonsense', ['TENANT:ADMIN'])
  expect(screen.getByText('Not found')).toBeInTheDocument()
})
