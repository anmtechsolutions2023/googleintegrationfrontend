import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Billing from '../Billing';
import posService from '../../../services/posService';

// An unpaid counter sale has to be reachable again.
//
// A dine-in round is always recoverable: the table is the handle and it stays
// on the floor plan until the session is settled. A counter sale had no handle
// at all — its id lived only in component state, set when the order was created
// and cleared by starting the next one. So ringing up a second customer
// stranded the first: the food was made, the order stayed open, and there was
// no way back to it to take the money. It surfaced afterwards only in Reports,
// as a row saying "not billed yet" with nothing to click.

jest.mock('../../../services/posService', () => ({
  __esModule: true,
  default: {
    getTables: jest.fn(), getFloors: jest.fn(), getItemMeta: jest.fn(),
    getOrders: jest.fn(), getItemDetail: jest.fn(), getVariants: jest.fn(),
    getAddonGroups: jest.fn(), getAddons: jest.fn(),
    getPaymentModes: jest.fn(), getBranchPaymentMethods: jest.fn(), getKots: jest.fn(), quotePricing: jest.fn(),
    createOrder: jest.fn(), updateOrder: jest.fn(), updateTable: jest.fn(),
    transferOrder: jest.fn(), deleteOrder: jest.fn(),
    fireKot: jest.fn(), createBill: jest.fn(), settleBill: jest.fn(),
    previewOffers: jest.fn(),
    getPosSettings: jest.fn(), getReceiptFormat: jest.fn(),
  },
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock('../../../context/AuthContext', () => ({ useAuth: jest.fn() }));
const { useAuth } = require('../../../context/AuthContext');

const CI = 'aaaaaaaa-0000-0000-0000-000000000001';
const BRANCH = 'bbbbbbbb-0000-0000-0000-000000000001';

const line = (name, amount) => ({
  name, costInfoId: CI, qty: 1, taxPct: 0,
  netAmount: amount, taxAmount: 0, grossAmount: amount,
  variantIds: [], taxComponents: [],
});

// The order from the report: takeaway, fired to the kitchen, never billed.
const UNPAID = {
  Id: 'o-unpaid', TableId: null, OrderType: 'takeaway', Status: 'fired',
  OrderNo: 'ORD-0003', BranchDetailId: BRANCH,
  SubTotal: 180, TaxAmount: 9, Total: 189,
  CreatedOn: '2026-09-09 18:24:24',
  Items: [line('Paneer Butter Masala', 189)],
};

// The one they rang up next and did settle. It must not come back.
const SETTLED = {
  Id: 'o-settled', TableId: null, OrderType: 'takeaway', Status: 'closed',
  OrderNo: 'ORD-0002', BranchDetailId: BRANCH,
  SubTotal: 289, TaxAmount: 0, Total: 289,
  CreatedOn: '2026-09-09 17:04:05',
  Items: [line('Chicken Triple Fried Rice', 289)],
};

beforeEach(() => {
  useAuth.mockReturnValue({
    user: {
      tid: 't1',
      onboardingStatus: 'APPROVED',
      scopes: ['POS_ORDER:READ', 'POS_ORDER:WRITE', 'POS_BILLING:READ', 'POS_BILLING:WRITE'],
    },
  });
  jest.clearAllMocks();
  posService.getTables.mockResolvedValue([{ Id: 't1', Name: 'T1', Status: 'free' }]);
  posService.getFloors.mockResolvedValue([]);
  posService.getOrders.mockResolvedValue([UNPAID, SETTLED]);
  posService.getItemMeta.mockResolvedValue([]);
  posService.getVariants.mockResolvedValue([]);
  posService.getAddonGroups.mockResolvedValue([]);
  posService.getAddons.mockResolvedValue([]);
  posService.getKots.mockResolvedValue([]);
  // The till reads the branch-resolved list; these suites are not about
  // payment methods, so it simply echoes whatever the catalogue mock holds.
  posService.getBranchPaymentMethods.mockImplementation(async () => ({
    methods: (await posService.getPaymentModes()).map((m) => ({
      paymentModeId: m.Id, type: m.Type, accountName: m.AccountName ?? null,
      accountKind: null, requiresReference: !!m.RequiresReference,
      active: true, enabled: true, enabledByDefault: true, source: 'default',
    })),
  }));
  posService.getPaymentModes.mockResolvedValue([{ Id: 'pm1', Type: 'Cash' }]);
  posService.getPosSettings.mockResolvedValue({ 'kot.auto_print': 'off' });
  posService.getReceiptFormat.mockResolvedValue(null);
});

const openPicker = async () => {
  render(<Billing />);
  await screen.findByText(/Pick a table to start/i);
};

describe('an unpaid counter sale is reachable from the floor plan', () => {
  it('lists it beside the counter, with what is owed', async () => {
    await openPicker();

    const tile = screen.getByRole('button', { name: /ORD-0003.*189.*unpaid/i });
    expect(tile).toBeInTheDocument();
  });

  it('says it is already with the kitchen, so the food is not re-made', async () => {
    await openPicker();
    expect(screen.getByText(/In kitchen/i)).toBeInTheDocument();
  });

  it('does NOT offer a sale that has already been paid for', async () => {
    await openPicker();
    expect(screen.queryByRole('button', { name: /ORD-0002/i })).not.toBeInTheDocument();
  });

  it('opens that order rather than starting an empty new one', async () => {
    await openPicker();
    fireEvent.click(screen.getByRole('button', { name: /ORD-0003/i }));

    // The counter opens on the ORDER, so its bill is there to be settled —
    // starting a new sale instead would show an empty cart and no total.
    await waitFor(() => {
      expect(screen.queryByText(/Pick a table to start/i)).not.toBeInTheDocument();
    });
    expect(await screen.findByText(/Counter order/i)).toBeInTheDocument();
    expect(screen.getAllByText(/189/).length).toBeGreaterThan(0);
  });

  // "Resume payment" already existed for the case where the settle modal was
  // closed by accident mid-sale. It could only ever fire inside the same
  // browser session, though, because nothing could put an EXISTING order back
  // into counter state — which is the case that actually strands money.
  it('offers to take the money once the order is open', async () => {
    await openPicker();
    fireEvent.click(screen.getByRole('button', { name: /ORD-0003/i }));

    expect(await screen.findByRole('button', { name: /Resume payment/i })).toBeInTheDocument();
    expect(screen.getByText(/waiting on payment/i)).toBeInTheDocument();
  });

  it('a new sale is still a new sale', async () => {
    await openPicker();
    fireEvent.click(screen.getByRole('button', { name: /New counter takeaway/i }));

    await waitFor(() => {
      expect(screen.queryByText(/Pick a table to start/i)).not.toBeInTheDocument();
    });
    // Nothing carried over from the unpaid order sitting next to the button.
    expect(screen.queryByText('ORD-0003')).not.toBeInTheDocument();
  });
});
