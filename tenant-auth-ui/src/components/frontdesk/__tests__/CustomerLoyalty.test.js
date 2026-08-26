import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CustomerProfile from '../CustomerProfile';
import posService from '../../../services/posService';
import useCan from '../../../hooks/useCan';
import { toast } from 'react-toastify';

// The points panel on a customer's profile. The behaviour that matters is that
// a balance can always be EXPLAINED — every movement names what caused it — and
// that a refund shows up here as points taken back, not as a silent decrease.

jest.mock('../../../services/posService', () => ({
  __esModule: true,
  default: {
    getCustomerProfile: jest.fn(),
    getLoyaltyStatement: jest.fn(),
    adjustLoyalty: jest.fn(),
  },
}));
jest.mock('../../../hooks/useCan', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));
jest.mock('../OrderLinkProvider', () => ({
  OrderNoLink: ({ children }) => <span>{children}</span>,
}));

const PROFILE = {
  Customer: {
    Id: 'c1', Name: 'Priya R', Phone: '9876543210', Email: null,
    Visits: 2, TotalSpent: 2000, LoyaltyPoints: 10, LastVisitAt: '2026-08-20',
  },
  Summary: { AverageOrderValue: 1000, AverageRating: 4.5 },
  Orders: [],
  Feedback: [],
};

const STATEMENT = {
  balance: 10,
  entries: [
    { Id: 'e3', EntryType: 'REVERSAL', Points: -10, Reason: 'Refunded — Wrong order', CreatedOn: '2026-08-21T10:00:00Z' },
    { Id: 'e2', EntryType: 'EARN', Points: 10, Reason: 'Earned on a sale of 1000', CreatedOn: '2026-08-20T10:00:00Z' },
    { Id: 'e1', EntryType: 'EARN', Points: 10, Reason: 'Earned on a sale of 1000', CreatedOn: '2026-08-19T10:00:00Z' },
  ],
};

// 'Loyalty points' appears twice by design — as the KPI counter and as the
// section heading — so the panel settling is the thing to wait on, not the text.
const open = async () => {
  render(<CustomerProfile customerId="c1" onClose={() => {}} />);
  await screen.findByText('Priya R');
  await waitFor(() =>
    expect(screen.queryByText('Loading points…')).not.toBeInTheDocument());
};

beforeEach(() => {
  jest.clearAllMocks();
  useCan.mockReturnValue(true);
  posService.getCustomerProfile.mockResolvedValue(PROFILE);
  posService.getLoyaltyStatement.mockResolvedValue(STATEMENT);
});

describe('the points statement', () => {
  test('shows the balance the ledger sums to', async () => {
    await open();
    const balanceRow = screen.getByText('Balance').closest('tr');
    expect(balanceRow.querySelectorAll('td')[1].textContent).toBe('10');
  });

  test('says plainly that a refund took points back', async () => {
    // "REVERSAL −10" is the stored fact; a manager needs to know it was the
    // refund that caused it, without going to look.
    await open();
    expect(screen.getByText('Taken back — sale refunded')).toBeInTheDocument();
    expect(screen.getByText('−10'.replace('−', '-'))).toBeInTheDocument();
  });

  test('shows earnings signed, so a column of numbers cannot be misread', async () => {
    await open();
    expect(screen.getAllByText('+10')).toHaveLength(2);
  });

  test('marks a deduction so it reads as one at a glance', async () => {
    await open();
    expect(screen.getByText('-10').className).toMatch(/is-negative/);
  });

  test('explains an empty balance rather than showing a bare zero', async () => {
    posService.getLoyaltyStatement.mockResolvedValue({ balance: 0, entries: [] });
    await open();
    expect(screen.getByText(/earned automatically when a bill/i)).toBeInTheDocument();
  });

  test('keeps the rest of the profile when the points panel fails', async () => {
    posService.getLoyaltyStatement.mockRejectedValue(new Error('403'));
    await open();
    expect(screen.getByText(/Could not load the points history/i)).toBeInTheDocument();
    expect(screen.getByText('Priya R')).toBeInTheDocument();
  });
});

describe('adjusting points by hand', () => {
  test('offers no adjustment to someone who may only read', async () => {
    useCan.mockReturnValue(false);
    await open();
    expect(screen.queryByRole('button', { name: 'Adjust' })).not.toBeInTheDocument();
  });

  test('sends a signed adjustment with its reason', async () => {
    posService.adjustLoyalty.mockResolvedValue({ points: 50, balance: 60 });
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Adjust' }));
    fireEvent.change(screen.getByLabelText('Points'), { target: { value: '50' } });
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Goodwill' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(posService.adjustLoyalty)
      .toHaveBeenCalledWith('c1', { Points: 50, Reason: 'Goodwill' }));
  });

  test('takes points back on a negative number', async () => {
    posService.adjustLoyalty.mockResolvedValue({ points: -20, balance: 0 });
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Adjust' }));
    fireEvent.change(screen.getByLabelText('Points'), { target: { value: '-20' } });
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Correction' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(posService.adjustLoyalty)
      .toHaveBeenCalledWith('c1', { Points: -20, Reason: 'Correction' }));
  });

  test('refuses an adjustment of zero without troubling the server', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Adjust' }));
    fireEvent.change(screen.getByLabelText('Points'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'nothing' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(posService.adjustLoyalty).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });

  test('insists on a reason', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Adjust' }));
    fireEvent.change(screen.getByLabelText('Points'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(posService.adjustLoyalty).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/Say why/i));
  });

  test('re-reads both the statement and the cached counter after adjusting', async () => {
    // pos_customer.LoyaltyPoints is a cache of the ledger. Refreshing one and
    // not the other would leave the two disagreeing on screen.
    posService.adjustLoyalty.mockResolvedValue({ points: 50, balance: 60 });
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Adjust' }));
    fireEvent.change(screen.getByLabelText('Points'), { target: { value: '50' } });
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Goodwill' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(posService.getLoyaltyStatement).toHaveBeenCalledTimes(2));
    expect(posService.getCustomerProfile).toHaveBeenCalledTimes(2);
  });

  test('reports a refusal from the server instead of appearing to succeed', async () => {
    posService.adjustLoyalty.mockRejectedValue({ response: { data: { message: 'Forbidden' } } });
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Adjust' }));
    fireEvent.change(screen.getByLabelText('Points'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Forbidden'));
  });
});
