import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import Ledger from '../Ledger';
import posService from '../../../services/posService';

jest.mock('../../../services/posService', () => ({
  __esModule: true,
  default: {
    getLedgerDocuments: jest.fn(),
    getLedgerDocument: jest.fn(),
    refundLedgerDocument: jest.fn(),
    // Partial returns.
    createLedgerReturn: jest.fn(),
    getReturnReasons: jest.fn(() => Promise.resolve([
      { Id: 'r-1', Name: 'Wrong item served', Code: 'WRONG_ITEM', IsFault: 1 },
      { Id: 'r-2', Name: 'Customer changed mind', Code: 'CHANGED_MIND', IsFault: 0 },
    ])),
  },
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));
// The ledger is offered on TRANSACTIONS:READ; refunding needs WRITE. Default to
// somebody who holds it, so the existing cases exercise the refund path.
jest.mock('../../../context/AuthContext', () => ({ useAuth: jest.fn() }));
const { useAuth } = require('../../../context/AuthContext');
const asUser = (scopes) => useAuth.mockReturnValue({
  user: { tid: 't1', onboardingStatus: 'APPROVED', scopes },
});

const DOCS = [
  { Id: 'l1', TransactionNo: 'INV-0042', TransactionDate: '2026-07-01', StatusName: 'SETTLED',
    NetAmount: 100, TaxAmount: 18, GrossAmount: 118, CustomerName: 'Rahul Verma', CustomerMobile: '9876543210' },
  { Id: 'l2', TransactionNo: 'INV-0043', TransactionDate: '2026-07-02', StatusName: 'REFUNDED',
    NetAmount: 50, TaxAmount: 9, GrossAmount: 59, CustomerName: null, CustomerMobile: null },
];

const DETAIL = {
  Id: 'l1', TransactionNo: 'INV-0042', TransactionDate: '2026-07-01', StatusName: 'SETTLED',
  NetAmount: 100, TaxAmount: 18, DiscountAmount: 0, RoundOff: 0, GrossAmount: 118,
  CustomerName: 'Rahul Verma', CustomerMobile: '9876543210', BranchName: 'Main',
  TaxByComponent: [{ name: 'CGST', amount: 9 }, { name: 'SGST', amount: 9 }],
  Lines: [{
    Id: 'ln1', LineNo: 1, ItemName: 'Masala Dosa', Quantity: 2, ReturnedQty: 0,
    UnitPrice: 130, GrossAmount: 306.8,
    Variants: [{ id: 'v1', name: 'Large', price: 30 }], TaxComponents: [],
  }],
  Tenders: [{ Amount: 118, PaymentMode: 'Card', RefNo: 'AUTH-1', ReceivedType: 'Full' }],
  History: [{ Id: 'h1', StatusName: 'SETTLED', CreatedBy: 'cashier@test.com' }],
  IsImmutable: true,
};

beforeEach(() => {
  asUser(['TRANSACTIONS:READ', 'TRANSACTIONS:WRITE']);
  posService.getLedgerDocuments.mockResolvedValue(DOCS);
  posService.getLedgerDocument.mockResolvedValue(DETAIL);
  posService.refundLedgerDocument.mockResolvedValue({ status: 'REFUNDED' });
  posService.getReturnReasons.mockResolvedValue([
    { Id: 'r-1', Name: 'Wrong item served', Code: 'WRONG_ITEM', IsFault: 1 },
    { Id: 'r-2', Name: 'Customer changed mind', Code: 'CHANGED_MIND', IsFault: 0 },
  ]);
  posService.createLedgerReturn.mockResolvedValue({
    transactionNo: 'CN-0001', grossAmount: 236, refundState: 'PARTIALLY_REFUNDED',
  });
});

afterEach(() => jest.clearAllMocks());

const renderLedger = async () => {
  render(<Ledger />);
  await screen.findByText('INV-0042');
};

describe('Ledger list', () => {
  test('lists documents with their invoice numbers and totals', async () => {
    await renderLedger();
    expect(screen.getByText('INV-0043')).toBeInTheDocument();
    expect(screen.getByText('₹118.00')).toBeInTheDocument();
  });

  test('labels an anonymous sale as a walk-in', async () => {
    await renderLedger();
    expect(screen.getByText('Walk-in')).toBeInTheDocument();
  });

  test('colour-codes the status', async () => {
    await renderLedger();
    // The filter <select> has options with the same text, so scope to the table.
    const table = screen.getByRole('table');
    expect(within(table).getByText('SETTLED')).toHaveClass('fd-ledger-status', 'settled');
    expect(within(table).getByText('REFUNDED')).toHaveClass('fd-ledger-status', 'refunded');
  });

  test('filters by status', async () => {
    await renderLedger();
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'REFUNDED' } });
    await waitFor(() =>
      expect(posService.getLedgerDocuments).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'REFUNDED' }),
      ));
  });

  test('shows an empty state that explains how documents appear', async () => {
    posService.getLedgerDocuments.mockResolvedValue([]);
    render(<Ledger />);
    expect(await screen.findByText(/Settling a bill posts it here/i)).toBeInTheDocument();
  });
});

describe('Invoice view', () => {
  const openInvoice = async () => {
    await renderLedger();
    fireEvent.click(screen.getByText('INV-0042'));
    // The dialog shows a loading state before the document arrives.
    await screen.findByText('Masala Dosa');
  };

  test('shows lines with the options that were sold', async () => {
    await openInvoice();
    const dialog = screen.getByRole('dialog', { name: /Invoice/i });
    expect(within(dialog).getByText('Masala Dosa')).toBeInTheDocument();
    expect(within(dialog).getByText('Large +₹30.00')).toBeInTheDocument();
  });

  test('shows the CGST/SGST split', async () => {
    await openInvoice();
    const dialog = screen.getByRole('dialog', { name: /Invoice/i });
    expect(within(dialog).getByText('CGST')).toBeInTheDocument();
    expect(within(dialog).getByText('SGST')).toBeInTheDocument();
  });

  test('shows the tender with its reference', async () => {
    await openInvoice();
    expect(screen.getByText(/Card · AUTH-1/)).toBeInTheDocument();
  });

  test('shows the transition history — how it reached this status', async () => {
    await openInvoice();
    expect(screen.getByText('cashier@test.com')).toBeInTheDocument();
  });

  test('offers Refund on a settled document, never Edit', async () => {
    await openInvoice();
    const dialog = screen.getByRole('dialog', { name: /Invoice/i });
    expect(within(dialog).getByRole('button', { name: /Refund/i })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /Edit/i })).not.toBeInTheDocument();
  });

  test('does not offer Refund on an already refunded document', async () => {
    posService.getLedgerDocument.mockResolvedValue({ ...DETAIL, StatusName: 'REFUNDED' });
    await renderLedger();
    fireEvent.click(screen.getByText('INV-0042'));
    await screen.findByText('Masala Dosa');
    const dialog = screen.getByRole('dialog', { name: /Invoice/i });
    expect(within(dialog).queryByRole('button', { name: /Refund/i })).not.toBeInTheDocument();
  });
});

describe('Refund', () => {
  test('explains that nothing is deleted before confirming', async () => {
    await renderLedger();
    fireEvent.click(screen.getByText('INV-0042'));
    await screen.findByText('Masala Dosa');
    fireEvent.click(screen.getByRole('button', { name: /^Refund all$/i }));

    expect(await screen.findByText(/Nothing is deleted/i)).toBeInTheDocument();
  });

  test('sends the reason with the reversal', async () => {
    await renderLedger();
    fireEvent.click(screen.getByText('INV-0042'));
    await screen.findByText('Masala Dosa');
    fireEvent.click(screen.getByRole('button', { name: /^Refund all$/i }));

    fireEvent.change(await screen.findByLabelText(/Reason/i), { target: { value: 'Wrong order' } });
    fireEvent.click(screen.getByRole('button', { name: /Confirm Refund/i }));

    await waitFor(() =>
      expect(posService.refundLedgerDocument).toHaveBeenCalledWith('l1', 'Wrong order'));
  });
});

// Reading the books and reversing an entry in them are different permissions.
describe('who may refund', () => {
  const openInvoice = async () => {
    render(<Ledger />);
    fireEvent.click(await screen.findByText('INV-0042'));
    await screen.findByText(/Masala Dosa/);
  };

  it('offers no Refund to somebody who may only read the ledger', async () => {
    asUser(['TRANSACTIONS:READ']);
    await openInvoice();
    expect(screen.queryByRole('button', { name: /Refund/i })).not.toBeInTheDocument();
    // …and the document is still fully readable. (INV-0042 appears in both the
    // list row and the open invoice, hence getAllByText.)
    expect(screen.getAllByText('INV-0042').length).toBeGreaterThan(0);
    expect(screen.getByText(/Masala Dosa/)).toBeInTheDocument();
  });

  it('offers it to a tenant admin, who holds no TRANSACTIONS scope at all', async () => {
    asUser(['TENANT:ADMIN']);
    await openInvoice();
    expect(await screen.findByRole('button', { name: /Refund/i })).toBeInTheDocument();
  });
});

// ── The return picker ───────────────────────────────────────────────────────
describe('Return items', () => {
  const openPicker = async () => {
    render(<Ledger />);
    fireEvent.click(await screen.findByText('INV-0042'));
    fireEvent.click(await screen.findByRole('button', { name: /Return items/i }));
    return screen.findByRole('dialog', { name: /Return items/i });
  };

  it('opens a picker listing what can come back', async () => {
    const picker = await openPicker();
    expect(within(picker).getByText(/Return against INV-0042/)).toBeInTheDocument();
  });

  // Two stacked backdrops darken to near-black, and the invoice behind cannot
  // be read or acted on anyway — which is what produced the unreadable overlap.
  it('does not leave the invoice modal stacked behind it', async () => {
    await openPicker();
    expect(screen.queryByRole('dialog', { name: /^Invoice$/i })).toBeNull();
  });

  it('brings the invoice back when the return is cancelled', async () => {
    const picker = await openPicker();
    fireEvent.click(within(picker).getByRole('button', { name: /Cancel/i }));
    expect(await screen.findByRole('dialog', { name: /^Invoice$/i })).toBeInTheDocument();
  });

  it('sends the selected lines to the API', async () => {
    const picker = await openPicker();
    const qty = within(picker).getAllByRole('spinbutton')[0];
    fireEvent.change(qty, { target: { value: '1' } });
    fireEvent.change(within(picker).getByLabelText(/^Reason$/i), { target: { value: 'r-1' } });
    fireEvent.click(within(picker).getByRole('button', { name: /^Return ₹/ }));

    await waitFor(() => expect(posService.createLedgerReturn).toHaveBeenCalledWith(
      'l1',
      expect.objectContaining({
        reasonId: 'r-1',
        lines: [{ lineId: 'ln1', quantity: 1 }],
      }),
    ));
  });
});
