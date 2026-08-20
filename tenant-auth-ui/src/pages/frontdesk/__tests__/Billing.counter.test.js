import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Billing from '../Billing';
import posService from '../../../services/posService';

// Counter service: takeaway punched in at the till, paid for on the spot, and
// handed a token. Billing used to refuse to build a cart at all until a table
// was chosen, so this flow had no entry point and the token screen had nothing
// to attach a number to.

jest.mock('../../../services/posService', () => ({
  __esModule: true,
  default: {
    getTables: jest.fn(), getFloors: jest.fn(), getItemMeta: jest.fn(),
    getOrders: jest.fn(), getItemDetail: jest.fn(), getVariants: jest.fn(),
    getPaymentModes: jest.fn(), getKots: jest.fn(), quotePricing: jest.fn(),
    createOrder: jest.fn(), updateOrder: jest.fn(), updateTable: jest.fn(),
    transferOrder: jest.fn(), deleteOrder: jest.fn(),
    fireKot: jest.fn(), createBill: jest.fn(), settleBill: jest.fn(),
  },
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

const CI_DOSA = 'aaaaaaaa-0000-0000-0000-000000000001';
const BRANCH = 'bbbbbbbb-0000-0000-0000-000000000001';
const MODE_CASH = 'mmmmmmmm-0000-0000-0000-000000000001';

const MENU = [{
  Id: 'm1', ItemDetailId: 'item-m1', CostInfoId: CI_DOSA, CostInfoAmount: 100,
  FoodTypeName: 'Veg', FoodTypeIsVeg: 1, VariantIds: [],
  // NOT NULL on pos_item_meta — which is why the counter needs no branch picker.
  BranchDetailId: BRANCH,
  TaxBreakdown: {
    netAmount: 100, taxAmount: 0, grossAmount: 100,
    effectiveRate: 0, components: [], isTaxIncluded: false,
  },
}];

const PLACED_ORDER = {
  Id: 'o-counter', TableId: null, OrderType: 'takeaway', Status: 'fired',
  OrderNo: 'ORD-0001', BranchDetailId: BRANCH,
  SubTotal: 100, TaxAmount: 0, Total: 100,
  CreatedOn: '2026-08-16 10:00:00',
  Items: [{
    name: 'Masala Dosa', costInfoId: CI_DOSA, qty: 1, taxPct: 0,
    netAmount: 100, taxAmount: 0, grossAmount: 100, variantIds: [], taxComponents: [],
  }],
};

beforeEach(() => {
  jest.clearAllMocks();
  posService.getTables.mockResolvedValue([{ Id: 't1', Name: 'T1', Status: 'free' }]);
  posService.getFloors.mockResolvedValue([]);
  posService.getOrders.mockResolvedValue([]);
  posService.getItemMeta.mockResolvedValue(MENU);
  posService.getVariants.mockResolvedValue([]);
  posService.getKots.mockResolvedValue([]);
  posService.getPaymentModes.mockResolvedValue([{ Id: MODE_CASH, Type: 'Cash' }]);
  posService.getItemDetail.mockResolvedValue({ Id: 'item-m1', Name: 'Masala Dosa' });
  posService.quotePricing.mockResolvedValue({
    lines: [{ ref: 'm1', costInfoId: CI_DOSA, quantity: 1, netAmount: 100, taxAmount: 0, grossAmount: 100 }],
    totals: { netAmount: 100, taxAmount: 0, grossAmount: 100, discountAmount: 0, taxByComponent: [] },
  });
  posService.createOrder.mockResolvedValue({ id: 'o-counter' });
  posService.fireKot.mockResolvedValue({ KotNo: 'KOT-0001' });
  posService.createBill.mockResolvedValue({ Id: 'b1' });
  posService.settleBill.mockResolvedValue({ TransactionNo: 'INV-0001', Total: 100, TokenLabel: '7' });
});

const openCounter = async () => {
  render(<Billing />);
  await screen.findByText(/Pick a table to start/i);
  fireEvent.click(screen.getByRole('button', { name: /Counter takeaway/i }));
};

const addDosa = () => {
  const card = screen.getAllByText('Masala Dosa').find((el) => el.className === 'item-name');
  fireEvent.click(card);
};

describe('Counter mode — getting into it', () => {
  it('offers the counter alongside the room', async () => {
    render(<Billing />);
    await screen.findByText(/Pick a table to start/i);
    expect(screen.getByRole('button', { name: /Counter takeaway/i })).toBeInTheDocument();
  });

  it('unlocks the menu without a table', async () => {
    await openCounter();
    expect(screen.queryByText(/Pick a table to start/i)).not.toBeInTheDocument();
    addDosa();
    await waitFor(() => expect(posService.quotePricing).toHaveBeenCalled());
  });

  // A counter-only outlet has no tables at all; the floor plan used to bail out
  // before rendering anything, leaving the till unusable there.
  it('is reachable when the tenant has no tables configured', async () => {
    posService.getTables.mockResolvedValue([]);
    render(<Billing />);
    expect(await screen.findByRole('button', { name: /Counter takeaway/i })).toBeInTheDocument();
    expect(screen.getByText(/No tables set up yet/i)).toBeInTheDocument();
  });

  it('leaves the cart behind when going back to the floor plan', async () => {
    await openCounter();
    addDosa();
    await waitFor(() => expect(posService.quotePricing).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /Back to floor plan/i }));
    expect(await screen.findByText(/Pick a table to start/i)).toBeInTheDocument();
  });
});

describe('Counter mode — placing and paying', () => {
  it('places a table-less takeaway order carrying the items\' own branch', async () => {
    await openCounter();
    addDosa();
    await waitFor(() => expect(posService.quotePricing).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /Place & Pay/i }));
    await waitFor(() => expect(posService.createOrder).toHaveBeenCalled());

    const [payload] = posService.createOrder.mock.calls[0];
    expect(payload).toMatchObject({
      TableId: null, OrderType: 'takeaway', BranchDetailId: BRANCH,
    });
  });

  // Counter food is being made now — there is no later moment at which the
  // cashier would decide to send it, unlike a dine-in round.
  it('fires the kitchen ticket without a second tap', async () => {
    await openCounter();
    addDosa();
    await waitFor(() => expect(posService.quotePricing).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /Place & Pay/i }));
    await waitFor(() => expect(posService.fireKot).toHaveBeenCalledWith('o-counter'));
  });

  it('goes straight to payment once the order is placed', async () => {
    posService.getOrders.mockResolvedValue([PLACED_ORDER]);
    await openCounter();
    addDosa();
    await waitFor(() => expect(posService.quotePricing).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /Place & Pay/i }));
    expect(await screen.findByText('Amount Payable')).toBeInTheDocument();
  });

  it('shows the token the server minted, so the cashier can read it out', async () => {
    posService.getOrders.mockResolvedValue([PLACED_ORDER]);
    await openCounter();
    addDosa();
    await waitFor(() => expect(posService.quotePricing).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /Place & Pay/i }));
    await screen.findByText('Amount Payable');

    fireEvent.click(screen.getByRole('button', { name: /Settle & Post|Save Partial/i }));
    await waitFor(() => expect(posService.settleBill).toHaveBeenCalled());

    expect(await screen.findByText('Token')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText(/Tell the customer this number/i)).toBeInTheDocument();
  });

  // There is no table to free, and calling updateTable with an empty id would
  // 404 against the API.
  it('frees no table on settle — there was never one', async () => {
    posService.getOrders.mockResolvedValue([PLACED_ORDER]);
    await openCounter();
    addDosa();
    await waitFor(() => expect(posService.quotePricing).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /Place & Pay/i }));
    await screen.findByText('Amount Payable');

    fireEvent.click(screen.getByRole('button', { name: /Settle & Post|Save Partial/i }));
    await waitFor(() => expect(posService.settleBill).toHaveBeenCalled());
    expect(posService.updateTable).not.toHaveBeenCalled();
  });

  it('the bill covers the counter order', async () => {
    posService.getOrders.mockResolvedValue([PLACED_ORDER]);
    await openCounter();
    addDosa();
    await waitFor(() => expect(posService.quotePricing).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /Place & Pay/i }));
    await screen.findByText('Amount Payable');

    fireEvent.click(screen.getByRole('button', { name: /Settle & Post|Save Partial/i }));
    await waitFor(() => expect(posService.createBill).toHaveBeenCalled());
    expect(posService.createBill.mock.calls[0][0].OrderIds).toEqual(['o-counter']);
  });

  // Closing the modal must not strand a paid-for-nothing order: it is still
  // there and can be finished.
  it('offers to resume payment on an order left unsettled', async () => {
    posService.getOrders.mockResolvedValue([PLACED_ORDER]);
    await openCounter();
    addDosa();
    await waitFor(() => expect(posService.quotePricing).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /Place & Pay/i }));
    await screen.findByText('Amount Payable');

    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/i }));
    expect(await screen.findByRole('button', { name: /Resume payment/i })).toBeInTheDocument();
  });
});
