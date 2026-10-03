import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Billing from '../Billing';

// The table, as the order panel's header describes it: who is sitting there,
// who is serving them, and whether they have had their bill. Plus the two
// things the till does with that — print the bill before payment, and open
// the payment sheet on the method the guest said they would use.

jest.mock('../../../services/posService', () => ({
  __esModule: true,
  default: {
    getTables: jest.fn(), getFloors: jest.fn(), getItemMeta: jest.fn(),
    getOrders: jest.fn(), getItemDetail: jest.fn(), getVariants: jest.fn(),
    getAddonGroups: jest.fn(), getAddons: jest.fn(),
    getPaymentModes: jest.fn(), getBranchPaymentMethods: jest.fn(), getKots: jest.fn(),
    quotePricing: jest.fn(), previewOffers: jest.fn(),
    createOrder: jest.fn(), updateOrder: jest.fn(), updateTable: jest.fn(),
    transferOrder: jest.fn(), deleteOrder: jest.fn(),
    fireKot: jest.fn(), createBill: jest.fn(), settleBill: jest.fn(),
    getPosSettings: jest.fn(),
    getWaiters: jest.fn(), setOrderServiceDetails: jest.fn(), markBillPrinted: jest.fn(),
  },
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock('../../../context/AuthContext', () => ({ useAuth: jest.fn() }));
// The printer itself is not under test — only what the till hands it.
const mockPrint = jest.fn();
jest.mock('../../../components/frontdesk/receipt/usePrintReceipt', () => ({
  __esModule: true,
  default: () => ({
    job: null, format: null, shop: null, taxMode: 'gst',
    print: mockPrint, failed: false, failedReason: null, clearFailed: () => {},
  }),
}));

const posService = require('../../../services/posService').default;
const { useAuth } = require('../../../context/AuthContext');

const BRANCH = 'bbbbbbbb-0000-0000-0000-000000000001';
const CI_CHAI = 'cccccccc-0000-0000-0000-000000000001';
const RAVI = 'aaaaaaaa-0000-0000-0000-000000000001';
const ASHA = 'aaaaaaaa-0000-0000-0000-000000000002';
const CASH = 'pppppppp-0000-0000-0000-000000000001';
const UPI = 'pppppppp-0000-0000-0000-000000000002';

const MENU = [{
  Id: 'm-chai', ItemDetailId: 'item-chai', ItemName: 'Masala Chai', CostInfoId: CI_CHAI, CostInfoAmount: 25,
  FoodTypeName: 'Veg', FoodTypeIsVeg: 1, VariantIds: [], BranchDetailId: BRANCH,
  TaxBreakdown: { effectiveRate: 0, isTaxIncluded: false, components: [] },
}];

/** An open round on T-1. */
const round = (id, extra = {}) => ({
  Id: id, TableId: 'tbl-1', Status: 'fired', OrderNo: `ORD-${id}`, OrderType: 'dinein',
  BranchDetailId: BRANCH, CreatedOn: '2026-10-03 10:00:00',
  SubTotal: 50, TaxAmount: 0, Total: 50,
  Items: [{ name: 'Masala Chai', costInfoId: CI_CHAI, qty: 2, netAmount: 50, taxAmount: 0, grossAmount: 50 }],
  ...extra,
});

beforeEach(() => {
  mockPrint.mockReset();
  useAuth.mockReturnValue({ user: { tid: 't1', onboardingStatus: 'APPROVED', scopes: ['POS_ORDER:WRITE', 'POS_BILLING:WRITE'] } });
  posService.getTables.mockResolvedValue([
    { Id: 'tbl-1', Name: 'T-1', Status: 'free', Capacity: 4, BranchDetailId: BRANCH },
  ]);
  posService.getFloors.mockResolvedValue([]);
  posService.getItemMeta.mockResolvedValue(MENU);
  posService.getItemDetail.mockResolvedValue({});
  posService.getOrders.mockResolvedValue([]);
  posService.getVariants.mockResolvedValue([]);
  posService.getAddonGroups.mockResolvedValue([]);
  posService.getAddons.mockResolvedValue([]);
  posService.getKots.mockResolvedValue([]);
  posService.getPosSettings.mockResolvedValue({ 'kot.auto_print': 'off' });
  posService.getPaymentModes.mockResolvedValue([
    { Id: CASH, Type: 'Cash', AccountName: 'Cash' },
    { Id: UPI, Type: 'UPI', AccountName: 'Bank' },
  ]);
  posService.getBranchPaymentMethods.mockImplementation(async () => ({
    methods: (await posService.getPaymentModes()).map((m) => ({
      paymentModeId: m.Id, type: m.Type, accountName: m.AccountName, accountKind: null,
      requiresReference: false, active: true, enabled: true, enabledByDefault: true, source: 'default',
    })),
  }));
  posService.quotePricing.mockImplementation(async (lines) => ({
    lines: lines.map((l) => ({
      ref: l.ref, costInfoId: l.costInfoId, quantity: l.quantity,
      unitAmount: 25, netAmount: 25 * l.quantity, taxAmount: 0, grossAmount: 25 * l.quantity,
    })),
    totals: {
      netAmount: lines.reduce((s, l) => s + 25 * l.quantity, 0),
      taxAmount: 0,
      grossAmount: lines.reduce((s, l) => s + 25 * l.quantity, 0),
      discountAmount: 0,
      taxByComponent: [],
    },
  }));
  posService.previewOffers.mockResolvedValue({ lineDiscounts: {}, applied: [], earned: [], skipped: [] });
  posService.getWaiters.mockResolvedValue([
    { Id: RAVI, Name: 'Ravi Kumar', BranchDetailId: BRANCH },
    { Id: ASHA, Name: 'Asha Rao', BranchDetailId: 'bbbbbbbb-0000-0000-0000-000000000009' },
  ]);
  posService.createOrder.mockResolvedValue({ id: 'o-new' });
  posService.updateTable.mockResolvedValue({});
  posService.setOrderServiceDetails.mockImplementation(async (p) => ({ ...p, WaiterName: p.WaiterId ? 'Ravi Kumar' : null }));
  posService.markBillPrinted.mockImplementation(async (orderIds) => ({ orderIds, BillPrintedAt: '2026-10-03T10:42:00Z' }));
});
afterEach(() => jest.clearAllMocks());

const openTable = async () => {
  render(<Billing />);
  await screen.findByText(/Pick a table to start/i);
  fireEvent.click(screen.getByRole('button', { name: /^T-1,/ }));
  await waitFor(() => expect(screen.queryByText(/Pick a table to start/i)).not.toBeInTheDocument());
};

const chaiTile = () => screen.getByRole('button', { name: /^Masala Chai, ₹/ });

describe('guests and waiter', () => {
  test('set before the first round, they ride on it', async () => {
    await openTable();
    fireEvent.click(screen.getByRole('button', { name: /Guests and waiter: Guests not set · No waiter/ }));

    fireEvent.change(screen.getByLabelText('Guests'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Waiter'), { target: { value: RAVI } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByRole('button', { name: /3 guests · Waiter: Ravi Kumar/ })).toBeInTheDocument();
    // Nothing to write to yet.
    expect(posService.setOrderServiceDetails).not.toHaveBeenCalled();

    fireEvent.click(chaiTile());
    await waitFor(() => expect(posService.quotePricing).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /Save Round 1/ }));
    await waitFor(() => expect(posService.createOrder).toHaveBeenCalled());
    expect(posService.createOrder.mock.calls[0][0]).toMatchObject({ GuestCount: 3, WaiterId: RAVI });
  });

  test('a round placed with nobody named sends neither field', async () => {
    await openTable();
    fireEvent.click(chaiTile());
    await waitFor(() => expect(posService.quotePricing).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /Save Round 1/ }));
    await waitFor(() => expect(posService.createOrder).toHaveBeenCalled());
    const sent = posService.createOrder.mock.calls[0][0];
    expect(sent).not.toHaveProperty('GuestCount');
    expect(sent).not.toHaveProperty('WaiterId');
  });

  test('changed on a running table, every open round is updated — and only what changed', async () => {
    posService.getOrders.mockResolvedValue([round('o1', { GuestCount: 2 }), round('o2', { GuestCount: 2, CreatedOn: '2026-10-03 10:20:00' })]);
    await openTable();
    const field = await screen.findByRole('button', { name: /2 guests · No waiter/ });
    fireEvent.click(field);

    fireEvent.click(screen.getByRole('button', { name: 'One more guest' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(posService.setOrderServiceDetails).toHaveBeenCalledWith({
      orderIds: ['o1', 'o2'], GuestCount: 3,
    }));
    expect(await screen.findByRole('button', { name: /3 guests · No waiter/ })).toBeInTheDocument();
  });

  test('lists this outlet\'s staff first and the rest under their own heading', async () => {
    await openTable();
    fireEvent.click(screen.getByRole('button', { name: /Guests and waiter/ }));
    const select = screen.getByLabelText('Waiter');
    // jsdom gives an optgroup no role, so it is found by its label.
    const group = select.querySelector('optgroup[label="Other outlets"]');
    expect([...group.querySelectorAll('option')].map((o) => o.textContent)).toEqual(['Asha Rao']);
    const before = [...select.querySelectorAll(':scope > option')].map((o) => o.textContent);
    expect(before).toEqual(['Not assigned', 'Ravi Kumar']);
  });
});

describe('printing the bill before payment', () => {
  test('prints a bill that is not the invoice, priced as Settle will price it, and marks the table', async () => {
    posService.getOrders.mockResolvedValue([round('o1', { WaiterId: RAVI, WaiterName: 'Ravi Kumar' })]);
    await openTable();
    await screen.findByRole('button', { name: /Waiter: Ravi Kumar/ });

    fireEvent.click(screen.getByRole('button', { name: 'Print bill' }));

    await waitFor(() => expect(mockPrint).toHaveBeenCalled());
    const [kind, doc] = mockPrint.mock.calls[0];
    expect(kind).toBe('bill');
    expect(doc).toMatchObject({
      provisional: true, tableName: 'T-1', waiter: 'Ravi Kumar', GrossAmount: 50,
    });
    expect(doc.Lines).toEqual([expect.objectContaining({ ItemName: 'Masala Chai', Quantity: 2, GrossAmount: 50 })]);
    expect(doc).not.toHaveProperty('TransactionNo');

    await waitFor(() => expect(posService.markBillPrinted).toHaveBeenCalledWith(['o1']));
    await waitFor(() => expect(document.querySelector('.fd-round-pill').textContent).toMatch(/^Bill printed/));
  });

  test('is not offered before anything has been saved', async () => {
    await openTable();
    expect(screen.getByRole('button', { name: 'Print bill' })).toBeDisabled();
  });

  test('the floor plan shows a table whose bill is out', async () => {
    posService.getOrders.mockResolvedValue([round('o1', { BillPrintedAt: '2026-10-03 10:42:00' })]);
    render(<Billing />);
    expect(await screen.findByRole('button', { name: /^T-1, bill printed/ })).toBeInTheDocument();
  });

  test('a round added after printing puts the table back to running', async () => {
    posService.getOrders.mockResolvedValue([
      round('o1', { BillPrintedAt: '2026-10-03 10:42:00' }),
      round('o2', { CreatedOn: '2026-10-03 10:50:00' }),
    ]);
    render(<Billing />);
    const tile = await screen.findByRole('button', { name: /^T-1,/ });
    expect(tile).not.toHaveAccessibleName(/Bill printed/);
  });
});

describe('the dish tile', () => {
  test('counts what is already in the order', async () => {
    await openTable();
    fireEvent.click(chaiTile());
    fireEvent.click(chaiTile());
    expect(chaiTile()).toHaveAccessibleName(/2 in this order/);
  });
});

describe('the expected payment method', () => {
  test('the payment sheet opens on the method picked in the order panel', async () => {
    posService.getOrders.mockResolvedValue([round('o1')]);
    await openTable();
    const upi = await screen.findByRole('radio', { name: 'UPI' });
    fireEvent.click(upi);

    fireEvent.click(screen.getByRole('button', { name: 'Settle bill' }));
    await screen.findByText('Amount Payable');
    // The panel's own row steps aside, so the sheet's radios are the only ones.
    await waitFor(() => expect(screen.getByRole('radio', { name: /^UPI/ })).toBeChecked());
    expect(screen.getByRole('radio', { name: /^Cash/ })).not.toBeChecked();
  });
});

describe('the phone sheet', () => {
  // Layout is CSS; what is tested here is the state the CSS reads.
  test('the bottom bar raises the order panel, and its close button lowers it', async () => {
    render(<Billing />);
    await screen.findByText(/Pick a table to start/i);
    const panel = () => screen.getByRole('button', { name: 'Close the order panel' }).closest('.fd-cart-panel');
    expect(panel()).not.toHaveClass('is-sheet-open');

    fireEvent.click(screen.getByRole('button', { name: 'Seat walk-in' }));
    expect(panel()).toHaveClass('is-sheet-open');

    fireEvent.click(screen.getByRole('button', { name: 'Close the order panel' }));
    expect(panel()).not.toHaveClass('is-sheet-open');
    expect(screen.getByRole('button', { name: 'Seat walk-in' })).toBeInTheDocument();
  });

  test('once a table is picked, the bar names it and offers the order', async () => {
    posService.getOrders.mockResolvedValue([round('o1')]);
    render(<Billing />);
    await screen.findByText(/Pick a table to start/i);
    fireEvent.click(screen.getByRole('button', { name: /^T-1,/ }));

    expect(await screen.findByText('T-1 · Round 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View order' })).toBeInTheDocument();
  });
});
