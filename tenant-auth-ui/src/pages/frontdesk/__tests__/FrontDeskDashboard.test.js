import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import FrontDeskDashboard from '../FrontDeskDashboard';
import posService from '../../../services/posService';
import { useAuth } from '../../../context/AuthContext';

// The landing page of the whole Front Desk section.
//
// Its figures come from /api/pos/reports, which requires POS_REPORTS:READ — a
// scope a cashier, waiter or kitchen user has no reason to hold. It used to ask
// regardless, so most of the staff were met with "Failed to load dashboard" the
// moment they signed in.

jest.mock('../../../services/posService', () => ({
  __esModule: true,
  default: { getDashboardStats: jest.fn() },
}));
jest.mock('../../../context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('react-toastify', () => ({
  toast: { error: jest.fn(), success: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock('../../../components/frontdesk/OrderLinkProvider', () => ({
  OrderNoLink: ({ children }) => <span>{children}</span>,
}));

const STATS = {
  todayRevenue: 4200, todayOrders: 12, totalTables: 8, occupiedTables: 3,
  pendingKots: 2, recentOrders: [],
};

const renderAs = async (scopes) => {
  useAuth.mockReturnValue({ user: { tid: 't1', onboardingStatus: 'APPROVED', scopes } });
  render(<MemoryRouter><FrontDeskDashboard /></MemoryRouter>);
  await waitFor(() => expect(screen.queryByText(/Loading dashboard/i)).not.toBeInTheDocument());
};

beforeEach(() => {
  jest.clearAllMocks();
  posService.getDashboardStats.mockResolvedValue(STATS);
});

describe('with reports access', () => {
  it('shows the takings', async () => {
    await renderAs(['POS_REPORTS:READ']);
    expect(posService.getDashboardStats).toHaveBeenCalled();
    expect(screen.getByText("Today's Revenue")).toBeInTheDocument();
  });

  it('a tenant admin sees them too', async () => {
    await renderAs(['TENANT:ADMIN']);
    expect(posService.getDashboardStats).toHaveBeenCalled();
  });
});

describe('without reports access', () => {
  const CASHIER = ['POS_ORDER:READ', 'POS_ORDER:WRITE', 'POS_BILLING:READ',
    'POS_BILLING:WRITE', 'POS_CRM:READ', 'POS_CONFIG:READ'];

  // Not asking is the fix. Catching the 403 and hiding the toast would still
  // put a refused request in the log on every sign-in.
  it('does not request figures it cannot have', async () => {
    await renderAs(CASHIER);
    expect(posService.getDashboardStats).not.toHaveBeenCalled();
  });

  it('says why, without dressing it up as a failure', async () => {
    await renderAs(CASHIER);
    expect(screen.getByText(/need reports access/i)).toBeInTheDocument();
    expect(screen.queryByText("Today's Revenue")).not.toBeInTheDocument();
  });

  // The useful thing to offer instead is the way to the work.
  it('offers the screens the role can actually open', async () => {
    await renderAs(CASHIER);
    expect(screen.getByText('Billing & KOT')).toBeInTheDocument();
    expect(screen.getByText('Customers')).toBeInTheDocument();
    // …and nothing the same role would be refused.
    expect(screen.queryByText('Ledger')).not.toBeInTheDocument();
    expect(screen.queryByText('Kitchen (KDS)')).not.toBeInTheDocument();
  });

  it('never links back to itself', async () => {
    await renderAs(CASHIER);
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
  });

  it('says so plainly when a role can open nothing at all', async () => {
    await renderAs(['SOMETHING:ELSE']);
    expect(screen.getByText(/Ask an administrator/i)).toBeInTheDocument();
  });
});
