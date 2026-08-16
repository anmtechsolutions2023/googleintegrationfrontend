import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import CashSessions from '../CashSessions';
import posService from '../../../services/posService';
import crudService from '../../../services/crudService';
import { useAuth } from '../../../context/AuthContext';

jest.mock('../../../services/posService', () => ({
  __esModule: true,
  default: {
    getCashSessions: jest.fn(),
    getCashSessionSummary: jest.fn(),
    openCashSession: jest.fn(),
    closeCashSession: jest.fn(),
  },
}));
jest.mock('../../../services/crudService', () => ({
  __esModule: true,
  default: { getAll: jest.fn() },
}));
jest.mock('../../../context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const OPEN_SESSION = {
  Id: 's1', CashierEmail: 'cashier@test.com', BranchName: 'Koramangala',
  BranchDetailId: 'b1', ShiftLabel: 'Morning', OpeningFloat: 1000,
  OpenedAt: '2026-08-02T09:00:00Z', ClosedAt: null, Status: 'open',
};

const CLOSED_SESSION = {
  Id: 's0', CashierEmail: 'night@test.com', BranchName: 'Koramangala',
  ShiftLabel: 'Night', OpeningFloat: 500, OpenedAt: '2026-08-01T18:00:00Z',
  ClosedAt: '2026-08-02T01:00:00Z', ExpectedCash: 1180, CountedCash: 1100,
  Variance: -80, Status: 'closed',
};

beforeEach(() => {
  useAuth.mockReturnValue({ user: { scopes: ['TENANT:ADMIN'] } });
  posService.getCashSessions.mockResolvedValue([OPEN_SESSION, CLOSED_SESSION]);
  posService.getCashSessionSummary.mockResolvedValue({ ...OPEN_SESSION, ExpectedCash: 1180, IsOpen: true });
  posService.openCashSession.mockResolvedValue({ Id: 's2' });
  posService.closeCashSession.mockResolvedValue({ ...CLOSED_SESSION, Id: 's1', Variance: -80 });
  crudService.getAll.mockResolvedValue({ data: [{ Id: 'b1', BranchName: 'Koramangala' }] });
});

afterEach(() => jest.clearAllMocks());

const renderPage = async () => {
  render(<CashSessions />);
  await screen.findByText('cashier@test.com');
};

describe('open tills', () => {
  test('lists an open till with its cashier, shift and float', async () => {
    await renderPage();
    const card = screen.getByText('cashier@test.com').closest('.fd-session-card');
    expect(within(card).getByText(/Koramangala · Morning/)).toBeInTheDocument();
    expect(within(card).getByText('₹1,000.00')).toBeInTheDocument();
  });

  test('a mid-shift check asks the server what the drawer should hold', async () => {
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Check drawer/i }));
    await waitFor(() => expect(posService.getCashSessionSummary).toHaveBeenCalledWith('s1'));
    expect(await screen.findByText('₹1,180.00')).toBeInTheDocument();
  });
});

describe('opening a till', () => {
  test('sends branch, shift and float', async () => {
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Open till/i }));
    fireEvent.change(await screen.findByLabelText(/Branch/i), { target: { value: 'b1' } });
    fireEvent.change(screen.getByLabelText(/Shift/i), { target: { value: 'Evening' } });
    fireEvent.change(screen.getByLabelText(/Opening float/i), { target: { value: '750' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open till' }));

    await waitFor(() => expect(posService.openCashSession).toHaveBeenCalledWith({
      BranchDetailId: 'b1', ShiftLabel: 'Evening', OpeningFloat: 750,
    }));
  });
});

describe('closing and reconciling', () => {
  const startClose = async () => {
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Close & count/i }));
    return screen.findByRole('dialog', { name: /Close till/i });
  };

  test('shows what the ledger expects before asking for a count', async () => {
    await startClose();
    expect(await screen.findByText('₹1,180.00')).toBeInTheDocument();
  });

  test('sends ONLY the counted cash — expected is the server’s to decide', async () => {
    await startClose();
    fireEvent.change(screen.getByLabelText(/Counted cash/i), { target: { value: '1100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Close till' }));

    await waitFor(() => expect(posService.closeCashSession).toHaveBeenCalledWith('s1', {
      CountedCash: 1100, Notes: null,
    }));
    const payload = posService.closeCashSession.mock.calls[0][1];
    expect(payload).not.toHaveProperty('ExpectedCash');
    expect(payload).not.toHaveProperty('Variance');
  });

  test('previews the shortfall live, so the variance is not a surprise', async () => {
    const dialog = await startClose();
    fireEvent.change(screen.getByLabelText(/Counted cash/i), { target: { value: '1100' } });
    // Scoped to the dialog: a closed shift in the table below legitimately
    // shows the same shortfall.
    expect(await within(dialog).findByText(/Short ₹80.00/)).toBeInTheDocument();
  });

  test('previews a surplus as over, not as a negative shortfall', async () => {
    const dialog = await startClose();
    fireEvent.change(screen.getByLabelText(/Counted cash/i), { target: { value: '1250' } });
    expect(await within(dialog).findByText(/Over ₹70.00/)).toBeInTheDocument();
  });

  test('refuses to close without a count', async () => {
    await startClose();
    fireEvent.click(screen.getByRole('button', { name: 'Close till' }));
    await waitFor(() => expect(posService.closeCashSession).not.toHaveBeenCalled());
  });
});

describe('closed shifts', () => {
  test('reports the variance as short, never as a bare number', async () => {
    await renderPage();
    const row = screen.getByText('night@test.com').closest('tr');
    expect(within(row).getByText(/Short ₹80.00/)).toBeInTheDocument();
    expect(within(row).getByText('₹1,180.00')).toBeInTheDocument(); // expected
    expect(within(row).getByText('₹1,100.00')).toBeInTheDocument(); // counted
  });

  test('a balanced till reads as balanced', async () => {
    posService.getCashSessions.mockResolvedValue([{ ...CLOSED_SESSION, Variance: 0, CountedCash: 1180 }]);
    render(<CashSessions />);
    expect(await screen.findByText('Balanced')).toBeInTheDocument();
  });
});
