import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import Dashboard from '../Dashboard';

// The page under test exists to stop raw scope codes reaching a person, so the
// assertions are mostly about what must NOT appear.
jest.mock('../../services/authService', () => ({
  getMyCapabilities: jest.fn(),
}));
jest.mock('../../context/AuthContext', () => ({ useAuth: jest.fn() }));

const { getMyCapabilities } = require('../../services/authService');
const { useAuth } = require('../../context/AuthContext');

const USER = {
  name: '3min everything', email: '3min@x.com', tid: 'tenant-1',
  scopes: ['POS_ORDER:READ', 'POS_ORDER:WRITE', 'AUDIT:READ', 'TENANT:ADMIN'],
};

const CAPS = {
  ranks: [{
    scope: 'TENANT:ADMIN',
    label: 'Administrator of this restaurant',
    note: 'Can do everything below, plus manage people and their access.',
  }],
  groups: [
    { key: 'front-desk', label: 'Front Desk', capabilities: [
      { label: 'Take and change orders', level: 'full', levelLabel: 'Full access',
        scopes: ['POS_ORDER:READ', 'POS_ORDER:WRITE'], named: true },
    ] },
    { key: 'business', label: 'Business', capabilities: [
      { label: 'Audit logs', level: 'view', levelLabel: 'View only',
        scopes: ['AUDIT:READ'], named: true },
    ] },
  ],
  scopes: USER.scopes,
};

beforeEach(() => {
  jest.clearAllMocks();
  useAuth.mockReturnValue({ user: USER });
  getMyCapabilities.mockResolvedValue(CAPS);
});

describe('the dashboard says what you can do, in words', () => {
  it('shows the readable capability, not the scope code', async () => {
    render(<Dashboard />);
    expect(await screen.findByText('Take and change orders')).toBeInTheDocument();
    expect(screen.getByText('Audit logs')).toBeInTheDocument();
  });

  it('states the level once per capability instead of two chips', async () => {
    render(<Dashboard />);
    expect(await screen.findByText('Full access')).toBeInTheDocument();
    expect(screen.getByText('View only')).toBeInTheDocument();
  });

  it('groups them by area', async () => {
    render(<Dashboard />);
    expect(await screen.findByText('Front Desk')).toBeInTheDocument();
    expect(screen.getByText('Business')).toBeInTheDocument();
  });

  // TENANT:ADMIN is a rank, not a capability — it comes from the membership,
  // not from a role, so it gets a banner rather than a line in the list.
  it('lifts an administrator out of the capability list', async () => {
    render(<Dashboard />);
    expect(await screen.findByText('Administrator of this restaurant')).toBeInTheDocument();
  });

  it('counts what it is showing', async () => {
    render(<Dashboard />);
    expect(await screen.findByText(/2 permissions across 2 areas/)).toBeInTheDocument();
  });

  // The whole point: no code on screen except inside the support disclosure.
  it('keeps the raw codes out of the main view', async () => {
    render(<Dashboard />);
    await screen.findByText('Take and change orders');
    const details = screen.getByText(/Technical detail/i).closest('details');
    const raw = screen.getAllByText(/POS_ORDER:WRITE/);
    raw.forEach((el) => expect(details).toContainElement(el));
  });

  it('still lists the codes for support', async () => {
    render(<Dashboard />);
    await screen.findByText('Take and change orders');
    const details = screen.getByText(/Technical detail/i).closest('details');
    expect(within(details).getByText(/POS_ORDER:READ/)).toBeInTheDocument();
    expect(within(details).getByText(/tenant-1/)).toBeInTheDocument();
  });

  // A failed lookup must not tell somebody they have no access.
  it('falls back to the codes rather than claiming no access', async () => {
    getMyCapabilities.mockRejectedValue(new Error('down'));
    render(<Dashboard />);
    await waitFor(() => expect(screen.getByText(/Could not load your permissions/)).toBeInTheDocument());
    const details = screen.getByText(/Technical detail/i).closest('details');
    expect(within(details).getByText(/POS_ORDER:READ/)).toBeInTheDocument();
  });

  it('marks a capability nothing could name properly', async () => {
    getMyCapabilities.mockResolvedValue({
      ranks: [],
      groups: [{ key: 'other', label: 'Other', capabilities: [
        { label: 'Reports — View', level: 'view', levelLabel: 'View only',
          scopes: ['REPORTS:READ'], named: false },
      ] }],
      scopes: ['REPORTS:READ'],
    });
    render(<Dashboard />);
    const row = (await screen.findByText('Reports — View')).closest('.dash-cap');
    expect(row).toHaveClass('dash-cap-unnamed');
  });
});
