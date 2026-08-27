import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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
    TypeName: 'POS Sale',
    NetAmount: 100, TaxAmount: 18, GrossAmount: 118, CustomerName: 'Rahul Verma', CustomerMobile: '9876543210' },
  { Id: 'l2', TransactionNo: 'INV-0043', TransactionDate: '2026-07-02', StatusName: 'REFUNDED',
    TypeName: 'POS Sale',
    NetAmount: 50, TaxAmount: 9, GrossAmount: 59, CustomerName: null, CustomerMobile: null },
  // A credit note. The ledger holds sales, expenses AND returns in one table,
  // so the list has to make clear which is which.
  { Id: 'cn1', TransactionNo: 'CN-0007', TransactionDate: '2026-07-02', StatusName: 'SETTLED',
    TypeName: 'POS Return', ReversesLogId: 'l1',
    NetAmount: 50, TaxAmount: 9, GrossAmount: 59, CustomerName: 'Rahul Verma', CustomerMobile: '9876543210' },
];

const DETAIL = {
  Id: 'l1', TransactionNo: 'INV-0042', TransactionDate: '2026-07-01', StatusName: 'SETTLED',
  TypeName: 'POS Sale',
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
  render(<MemoryRouter><Ledger /></MemoryRouter>);
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
    // The filter <select> has options with the same text, and a credit note is
    // SETTLED too — so scope to the row, not just the table.
    const row = screen.getByText('INV-0042').closest('tr');
    expect(within(row).getByText('SETTLED')).toHaveClass('fd-ledger-status', 'settled');
    const refunded = screen.getByText('INV-0043').closest('tr');
    expect(within(refunded).getByText('REFUNDED')).toHaveClass('fd-ledger-status', 'refunded');
  });

  // The ledger holds sales, expenses AND credit notes in one table. Without the
  // badge a CN-0007 sits in the list looking exactly like a sale of the same
  // value — which is how a refund gets counted as revenue by eye.
  test('badges a credit note so it cannot be read as a sale', async () => {
    await renderLedger();
    const note = screen.getByText('CN-0007').closest('tr');
    expect(within(note).getByText('Credit note')).toBeInTheDocument();
    // …and a sale carries no badge, because badging everything hides the point.
    const sale = screen.getByText('INV-0042').closest('tr');
    expect(within(sale).queryByText(/Credit note|Expense/)).toBeNull();
  });

  test('filters by document type', async () => {
    await renderLedger();
    fireEvent.change(screen.getByLabelText('Document type'), { target: { value: 'POS Return' } });
    await waitFor(() => expect(posService.getLedgerDocuments)
      .toHaveBeenLastCalledWith(expect.objectContaining({ docType: 'POS Return' })));
  });

  // A separate axis from status: a partly-refunded sale is still SETTLED, which
  // is exactly what lets a second return happen against it.
  test('filters by refund state, independently of status', async () => {
    await renderLedger();
    fireEvent.change(screen.getByLabelText('Refund state'), {
      target: { value: 'PARTIALLY_REFUNDED' },
    });
    await waitFor(() => expect(posService.getLedgerDocuments)
      .toHaveBeenLastCalledWith(expect.objectContaining({ refundState: 'PARTIALLY_REFUNDED' })));
    // Not smuggled into `status` — they are different questions.
    const [params] = posService.getLedgerDocuments.mock.calls.at(-1);
    expect(params.status).toBeUndefined();
  });

  // A bill posted but not yet tendered sits here as DRAFT, and it was the one
  // status somebody actually needs to chase that could not be selected.
  test('offers DRAFT as a status', async () => {
    await renderLedger();
    const options = within(screen.getByLabelText('Status'))
      .getAllByRole('option').map((o) => o.value);
    expect(options).toContain('DRAFT');
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
    render(<MemoryRouter><Ledger /></MemoryRouter>);
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
    render(<MemoryRouter><Ledger /></MemoryRouter>);
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

// ── Opening a credit note ───────────────────────────────────────────────────
// Now that credit notes appear in the list, one can be opened — and a note is
// not a sale: there is nothing to return against it, and it is meaningless
// without the invoice it came off.
describe('a credit note in the drawer', () => {
  const CN_DETAIL = {
    Id: 'cn1', TransactionNo: 'CN-0007', TransactionDate: '2026-07-02',
    StatusName: 'SETTLED', TypeName: 'POS Return',
    ReversesLogId: 'l1', OriginalNo: 'INV-0042',
    NetAmount: 50, TaxAmount: 9, DiscountAmount: 0, RoundOff: 0, GrossAmount: 59,
    CustomerName: 'Rahul Verma', TaxByComponent: [], Lines: [], Tenders: [], History: [],
    Returns: [], ReturnedAmount: 0, RefundState: 'NONE',
  };

  const openNote = async () => {
    render(<MemoryRouter><Ledger /></MemoryRouter>);
    posService.getLedgerDocument.mockResolvedValueOnce(CN_DETAIL);
    fireEvent.click(await screen.findByText('CN-0007'));
    const dialog = await screen.findByRole('dialog', { name: /^Invoice$/i });
    // The backdrop renders while the detail is still loading, so wait for the
    // document itself — otherwise every queryBy below passes on an empty modal.
    await within(dialog).findByRole('heading', { name: 'CN-0007' });
    return dialog;
  };

  test('offers neither Return items nor Refund all — it IS the return', async () => {
    const dialog = await openNote();
    expect(within(dialog).queryByRole('button', { name: /Return items/i })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: /Refund all/i })).toBeNull();
  });

  test('links back to the invoice it came off', async () => {
    const dialog = await openNote();
    fireEvent.click(within(dialog).getByRole('button', { name: /against invoice INV-0042/i }));
    await waitFor(() => expect(posService.getLedgerDocument).toHaveBeenLastCalledWith('l1'));
  });
});

// The receiving end of the link from the returns register. Without it the link
// could only drop somebody on the list with a number to search for themselves.
describe('?doc= deep link', () => {
  test('opens that document straight away', async () => {
    render(
      <MemoryRouter initialEntries={['/frontdesk/ledger?doc=l1']}>
        <Ledger />
      </MemoryRouter>,
    );
    await waitFor(() => expect(posService.getLedgerDocument).toHaveBeenCalledWith('l1'));
    expect(await screen.findByRole('dialog', { name: /^Invoice$/i })).toBeInTheDocument();
  });
});

// ── The return picker ───────────────────────────────────────────────────────
describe('Return items', () => {
  const openPicker = async () => {
    render(<MemoryRouter><Ledger /></MemoryRouter>);
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
