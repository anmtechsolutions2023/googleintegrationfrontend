import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import Expenses from '../Expenses';
import posService from '../../../services/posService';
import crudService from '../../../services/crudService';
import { useAuth } from '../../../context/AuthContext';

jest.mock('../../../services/posService', () => ({
  __esModule: true,
  default: {
    getExpenses: jest.fn(),
    createExpense: jest.fn(),
    updateExpense: jest.fn(),
    deleteExpense: jest.fn(),
    approveExpense: jest.fn(),
    rejectExpense: jest.fn(),
    settleExpense: jest.fn(),
    getExpenseCategories: jest.fn(),
    getPaymentModes: jest.fn(),
    getPosBranches: jest.fn(),
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

const EXPENSES = [
  { Id: 'e1', ExpenseCategoryId: 'c1', CategoryName: 'Gas', Description: 'LPG refill',
    Amount: 80, ExpenseDate: '2026-08-01', Status: 'draft', PaymentModeId: 'm1',
    PaymentMode: 'Cash', TransactionDetailLogId: null, TransactionNo: null },
  { Id: 'e2', ExpenseCategoryId: 'c2', CategoryName: 'Rent', Description: 'August rent',
    Amount: 25000, ExpenseDate: '2026-08-01', Status: 'approved', PaymentModeId: null,
    PaymentMode: null, TransactionDetailLogId: null, TransactionNo: null },
  { Id: 'e3', ExpenseCategoryId: 'c1', CategoryName: 'Gas', Description: 'Earlier refill',
    Amount: 75, ExpenseDate: '2026-07-28', Status: 'settled', PaymentModeId: 'm1',
    PaymentMode: 'Cash', TransactionDetailLogId: 'log-1', TransactionNo: 'EXP-0001' },
];

const asUser = (scopes) => useAuth.mockReturnValue({ user: { scopes } });

beforeEach(() => {
  posService.getPosBranches.mockResolvedValue([{ Id: 'b1', BranchName: 'Koramangala' }]);
  posService.getExpenses.mockResolvedValue(EXPENSES);
  posService.getExpenseCategories.mockResolvedValue([
    { Id: 'c1', Name: 'Gas' }, { Id: 'c2', Name: 'Rent' },
  ]);
  posService.getPaymentModes.mockResolvedValue([
    { Id: 'm1', Type: 'Cash' }, { Id: 'm2', Type: 'Card' },
  ]);
  posService.approveExpense.mockResolvedValue({});
  posService.rejectExpense.mockResolvedValue({});
  posService.settleExpense.mockResolvedValue({ transactionNo: 'EXP-0002' });
  posService.createExpense.mockResolvedValue({ id: 'new' });
  crudService.getAll.mockResolvedValue({ data: [{ Id: 'b1', BranchName: 'Koramangala' }] });
  asUser(['TENANT:ADMIN']);
});

afterEach(() => jest.clearAllMocks());

const renderPage = async () => {
  render(<Expenses />);
  await screen.findByText('LPG refill');
};

const rowFor = (description) =>
  screen.getByText(description).closest('tr');

describe('the lifecycle is visible', () => {
  test('shows each expense with its status', async () => {
    await renderPage();
    expect(within(rowFor('LPG refill')).getByText('Draft')).toBeInTheDocument();
    expect(within(rowFor('August rent')).getByText('Approved')).toBeInTheDocument();
    expect(within(rowFor('Earlier refill')).getByText('Settled')).toBeInTheDocument();
  });

  test('separates committed money from money that has actually gone', async () => {
    await renderPage();
    // "Awaiting payment" is both a KPI label and a filter chip, so read the
    // card's own value rather than matching the text anywhere on the page.
    const awaiting = screen.getAllByText('Awaiting payment')
      .map((el) => el.closest('.fd-kpi-card'))
      .find(Boolean);
    expect(awaiting.querySelector('.kpi-value').textContent).toBe('₹25,000.00');
    // Settled is money that has actually left; the two must not be one figure.
    const settled = screen.getAllByText('Settled')
      .map((el) => el.closest('.fd-kpi-card'))
      .find(Boolean);
    expect(settled.querySelector('.kpi-value').textContent).toBe('₹75.00');
  });

  test('shows the document number only once an expense is settled', async () => {
    await renderPage();
    expect(within(rowFor('Earlier refill')).getByText('EXP-0001')).toBeInTheDocument();
    expect(within(rowFor('LPG refill')).queryByText(/EXP-/)).not.toBeInTheDocument();
  });
});

describe('approval gate', () => {
  test('offers approve and reject only on a draft', async () => {
    await renderPage();
    expect(within(rowFor('LPG refill')).getByRole('button', { name: 'Approve' })).toBeInTheDocument();
    expect(within(rowFor('August rent')).queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
  });

  test('approving calls the dedicated endpoint, never a Status field', async () => {
    await renderPage();
    fireEvent.click(within(rowFor('LPG refill')).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(posService.approveExpense).toHaveBeenCalledWith('e1'));
    expect(posService.updateExpense).not.toHaveBeenCalled();
  });

  test('rejecting a draft posts a reject, not a delete', async () => {
    await renderPage();
    fireEvent.click(within(rowFor('LPG refill')).getByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(posService.rejectExpense).toHaveBeenCalledWith('e1'));
    expect(posService.deleteExpense).not.toHaveBeenCalled();
  });

  test('hides approve from someone who can only record expenses', async () => {
    // Whoever raises a claim must not be able to approve their own spending.
    asUser(['POS_OPS:WRITE', 'POS_OPS:READ']);
    await renderPage();
    expect(within(rowFor('LPG refill')).queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(within(rowFor('LPG refill')).getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });

  test('shows approve to an approver', async () => {
    asUser(['EXPENSE:APPROVE']);
    await renderPage();
    expect(within(rowFor('LPG refill')).getByRole('button', { name: 'Approve' })).toBeInTheDocument();
  });
});

describe('settlement — the only step that posts', () => {
  test('offers settle only once approved', async () => {
    await renderPage();
    expect(within(rowFor('August rent')).getByRole('button', { name: /Settle/i })).toBeInTheDocument();
    expect(within(rowFor('LPG refill')).queryByRole('button', { name: /Settle/i })).not.toBeInTheDocument();
  });

  test('requires a payment mode — it decides which account the money left', async () => {
    await renderPage();
    fireEvent.click(within(rowFor('August rent')).getByRole('button', { name: /Settle/i }));
    await screen.findByRole('dialog', { name: /Settle expense/i });
    fireEvent.click(screen.getByRole('button', { name: /Settle & post/i }));
    await waitFor(() => expect(posService.settleExpense).not.toHaveBeenCalled());
  });

  test('posts with the chosen mode', async () => {
    await renderPage();
    fireEvent.click(within(rowFor('August rent')).getByRole('button', { name: /Settle/i }));
    await screen.findByRole('dialog', { name: /Settle expense/i });
    fireEvent.change(screen.getByLabelText(/Paid by/i), { target: { value: 'm2' } });
    fireEvent.click(screen.getByRole('button', { name: /Settle & post/i }));
    await waitFor(() => expect(posService.settleExpense).toHaveBeenCalledWith('e2', 'm2'));
  });

  test('warns that settling cannot be undone by editing', async () => {
    await renderPage();
    fireEvent.click(within(rowFor('August rent')).getByRole('button', { name: /Settle/i }));
    expect(await screen.findByText(/only reversed/i)).toBeInTheDocument();
  });
});

describe('immutability of a posted expense', () => {
  test('offers no edit or delete once it has a document', async () => {
    await renderPage();
    const row = rowFor('Earlier refill');
    expect(within(row).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    expect(within(row).getByText(/Locked/i)).toBeInTheDocument();
  });
});

describe('raising an expense', () => {
  test('never sends a Status — it is always born a draft', async () => {
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: /New expense/i }));
    fireEvent.change(screen.getByLabelText(/Category/i), { target: { value: 'c1' } });
    fireEvent.change(screen.getByLabelText(/Amount/i), { target: { value: '120' } });
    fireEvent.click(screen.getByRole('button', { name: /Raise expense/i }));

    await waitFor(() => expect(posService.createExpense).toHaveBeenCalled());
    const payload = posService.createExpense.mock.calls[0][0];
    expect(payload).not.toHaveProperty('Status');
    expect(payload.ExpenseCategoryId).toBe('c1');
    expect(payload.Amount).toBe(120);
  });

  test('refuses a zero amount before it reaches the server', async () => {
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: /New expense/i }));
    fireEvent.change(screen.getByLabelText(/Category/i), { target: { value: 'c1' } });
    fireEvent.change(screen.getByLabelText(/Amount/i), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /Raise expense/i }));
    await waitFor(() => expect(posService.createExpense).not.toHaveBeenCalled());
  });
});

describe('filters', () => {
  test('narrows the list to one status', async () => {
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Awaiting payment' }));
    expect(screen.getByText('August rent')).toBeInTheDocument();
    expect(screen.queryByText('LPG refill')).not.toBeInTheDocument();
  });
});
