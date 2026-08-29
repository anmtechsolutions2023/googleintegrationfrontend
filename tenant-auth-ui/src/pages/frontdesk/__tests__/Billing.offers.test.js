import React from 'react';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import Billing from '../Billing';

// Campaign offers at the till.
//
// The rule under all of this: what the cashier sees is a PREVIEW. The server
// re-runs the same offers inside the settle transaction and writes the
// discounts itself, so nothing here can grant a discount and nothing here
// failing can withhold one.

jest.mock('../../../services/posService', () => ({
  __esModule: true,
  default: {
    getTables: jest.fn(), getFloors: jest.fn(), getItemMeta: jest.fn(),
    getOrders: jest.fn(), getItemDetail: jest.fn(), getVariants: jest.fn(),
    getPaymentModes: jest.fn(), getKots: jest.fn(), quotePricing: jest.fn(),
    createOrder: jest.fn(), updateOrder: jest.fn(), updateTable: jest.fn(),
    transferOrder: jest.fn(), deleteOrder: jest.fn(),
    fireKot: jest.fn(), createBill: jest.fn(), settleBill: jest.fn(),
    previewOffers: jest.fn(),
    getReceiptFormat: jest.fn(), getLedgerDocument: jest.fn(),
  },
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock('../../../context/AuthContext', () => ({ useAuth: jest.fn() }));

const posService = require('../../../services/posService').default;
const { useAuth } = require('../../../context/AuthContext');
const { toast } = require('react-toastify');

const CI_CHAI = 'cccccccc-0000-0000-0000-000000000001';
const CI_JAMUN = 'cccccccc-0000-0000-0000-000000000002';

const menuRow = (id, itemId, costInfoId, amount) => ({
  Id: id, ItemDetailId: itemId, CostInfoId: costInfoId, CostInfoAmount: amount,
  FoodTypeName: 'Veg', FoodTypeIsVeg: 1, VariantIds: [],
  TaxBreakdown: { netAmount: amount, taxAmount: 0, grossAmount: amount, effectiveRate: 0, components: [], isTaxIncluded: false },
});

const MENU = [
  menuRow('m-chai', 'item-chai', CI_CHAI, 25),
  menuRow('m-jamun', 'item-jamun', CI_JAMUN, 25),
];
const ITEM_DETAILS = {
  'item-chai': { Id: 'item-chai', Name: 'Masala Chai', CategoryId: 'cat-bev' },
  'item-jamun': { Id: 'item-jamun', Name: 'Gulab Jamun', CategoryId: 'cat-swt' },
};

const NO_OFFERS = { lineDiscounts: {}, applied: [], earned: [], skipped: [], totalDiscount: 0, considered: 0 };

beforeEach(() => {
  jest.useFakeTimers();
  useAuth.mockReturnValue({ user: { tid: 't1', onboardingStatus: 'APPROVED', scopes: ['POS_ORDER:WRITE', 'POS_BILLING:WRITE'] } });
  posService.getTables.mockResolvedValue([{ Id: 'tbl-1', Name: 'T-1', Status: 'free' }]);
  posService.getFloors.mockResolvedValue([]);
  posService.getItemMeta.mockResolvedValue(MENU);
  posService.getItemDetail.mockImplementation(async (id) => ITEM_DETAILS[id] || {});
  posService.getOrders.mockResolvedValue([]);
  posService.getVariants.mockResolvedValue([]);
  posService.getPaymentModes.mockResolvedValue([]);
  posService.getKots.mockResolvedValue([]);
  // The real shape: totals live under `totals`.
  posService.quotePricing.mockResolvedValue({
    lines: [{ ref: 'm-chai', costInfoId: CI_CHAI, quantity: 1, netAmount: 25, taxAmount: 0, grossAmount: 25, components: [] }],
    totals: { netAmount: 25, taxAmount: 0, grossAmount: 25, discountAmount: 0, taxByComponent: [] },
  });
  posService.previewOffers.mockResolvedValue(NO_OFFERS);
});
afterEach(() => { jest.runOnlyPendingTimers(); jest.useRealTimers(); jest.clearAllMocks(); });

const start = async () => {
  render(<Billing />);
  await screen.findByText(/Pick a table to start/i);
  fireEvent.click(screen.getByText('T-1'));
  await waitFor(() => expect(screen.queryByText(/Pick a table to start/i)).not.toBeInTheDocument());
};

const addChai = () => {
  const card = screen.getAllByText('Masala Chai').find((el) => el.className === 'item-name');
  fireEvent.click(card);
};

/** The debounce is 350ms — let it fire and settle. */
const settleDebounce = async () => {
  await act(async () => { jest.advanceTimersByTime(400); });
};

describe('offers on the cart, before anybody settles', () => {
  test('sends the catalogue ids an offer triggers on, not the menu ids', async () => {
    await start();
    addChai();
    await settleDebounce();

    await waitFor(() => expect(posService.previewOffers).toHaveBeenCalled());
    const [lines] = posService.previewOffers.mock.calls.at(-1);
    // The cart is keyed by MENU entry; a campaign names the catalogue item.
    expect(lines[0]).toMatchObject({ itemId: 'item-chai', categoryId: 'cat-bev', quantity: 1 });
  });

  // The kitchen made it and the stock moved — a removed line is a chai nobody
  // can account for.
  test('strikes a discounted line through rather than removing it', async () => {
    await start();
    addChai();
    await settleDebounce();

    posService.previewOffers.mockResolvedValue({
      ...NO_OFFERS,
      applied: [{
        offerId: 'off-1', campaignId: 'c-1', name: 'Buy 2 chai, get 1 free',
        campaignName: 'Monsoon Chai Fest', discountAmount: 25,
        awards: [{ ref: 'm-chai', itemId: 'item-chai', itemName: 'Masala Chai', quantity: 1, percent: 100, discountAmount: 25 }],
      }],
      totalDiscount: 25,
    });
    addChai();
    await settleDebounce();

    await waitFor(() => expect(document.querySelector('.ci-was')).toBeInTheDocument());
    expect(document.querySelector('.ci-was')).toHaveTextContent('₹50.00');
    expect(document.querySelector('.ci-now')).toHaveTextContent('₹25.00');
    // The line is still there.
    expect(screen.getAllByText('Masala Chai').length).toBeGreaterThan(1);
  });

  // "−₹25" tells a cashier nothing when a customer asks why the total moved.
  test('names the campaign in the totals rather than only netting it', async () => {
    posService.previewOffers.mockResolvedValue({
      ...NO_OFFERS,
      applied: [{
        offerId: 'off-1', campaignId: 'c-1', name: 'Buy 2 chai, get 1 free',
        campaignName: 'Monsoon Chai Fest', discountAmount: 25,
        awards: [{ ref: 'm-chai', itemId: 'item-chai', itemName: 'Masala Chai', quantity: 1, percent: 100, discountAmount: 25 }],
      }],
      totalDiscount: 25,
    });
    await start();
    addChai();
    await settleDebounce();

    await waitFor(() => expect(screen.getByText(/Monsoon Chai Fest/)).toBeInTheDocument());
    expect(screen.getByText('−₹25.00')).toBeInTheDocument();
  });

  // Offers are a bonus on top of a working till.
  test('a campaign service that is down does not stop order taking', async () => {
    posService.previewOffers.mockRejectedValue(new Error('down'));
    await start();
    addChai();
    await settleDebounce();

    expect(document.querySelector('.ci-was')).toBeNull();
    expect(screen.getAllByText('Masala Chai').length).toBeGreaterThan(1);
  });

  // A synchronous throw never reaches a promise's catch, and would surface as
  // an uncaught error inside the debounce timer.
  test('and neither does one that throws synchronously', async () => {
    posService.previewOffers.mockImplementation(() => { throw new Error('boom'); });
    await start();
    addChai();
    await expect(settleDebounce()).resolves.toBeUndefined();
    expect(screen.getAllByText('Masala Chai').length).toBeGreaterThan(1);
  });

  // Six taps on + is six chances to show a stale answer.
  test('debounces while somebody is still adding', async () => {
    await start();
    addChai(); addChai(); addChai();
    await settleDebounce();
    expect(posService.previewOffers).toHaveBeenCalledTimes(1);
  });
});

describe('an offer the customer has earned but not taken', () => {
  const EARNED = {
    ...NO_OFFERS,
    earned: [{
      offerId: 'off-2', campaignId: 'c-1', name: 'Free jamun over ₹500',
      campaignName: 'Monsoon Chai Fest', rewardItemId: 'item-jamun', earned: true,
    }],
    considered: 1,
  };

  const openCheck = async () => {
    await start();
    addChai();
    await settleDebounce();
    posService.previewOffers.mockResolvedValue(EARNED);
    fireEvent.click(screen.getByRole('button', { name: /Check offers/ }));
    await screen.findByRole('dialog', { name: /Offer check/i });
  };

  test('is listed as earned, not as a failure', async () => {
    await openCheck();
    const panel = screen.getByRole('dialog', { name: /Offer check/i });
    expect(within(panel).getByText('Earned, but not taken')).toBeInTheDocument();
    expect(within(panel).getByText('Free jamun over ₹500')).toBeInTheDocument();
  });

  // A free item has to EXIST as a line before anything can be taken off it.
  test('adds the reward item to the cart in one click', async () => {
    await openCheck();
    fireEvent.click(screen.getByRole('button', { name: 'Add it' }));

    // It is in the cart, and the panel gets out of the way.
    await waitFor(() => expect(screen.getAllByText('Gulab Jamun').length).toBeGreaterThan(1));
    expect(screen.queryByRole('dialog', { name: /Offer check/i })).toBeNull();
    expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/Gulab Jamun added/));
  });

  test('says so plainly when the reward is not on this branch’s menu', async () => {
    posService.previewOffers.mockResolvedValue({
      ...EARNED,
      earned: [{ ...EARNED.earned[0], rewardItemId: 'item-not-here' }],
    });
    await start();
    addChai();
    await settleDebounce();
    fireEvent.click(screen.getByRole('button', { name: /Check offers/ }));
    await screen.findByRole('dialog', { name: /Offer check/i });

    fireEvent.click(screen.getByRole('button', { name: 'Add it' }));
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/not on this branch/));
  });
});

describe('the check panel', () => {
  test('says why each offer did not apply — a silent no is what loses trust', async () => {
    posService.previewOffers.mockResolvedValue({
      ...NO_OFFERS,
      skipped: [{
        offerId: 'off-3', name: 'Second paneer at half price',
        reason: 'NOT_ENOUGH_ITEMS', message: null, needed: 2, have: 1, shortBy: 1,
      }],
      considered: 1,
    });
    await start();
    addChai();
    await settleDebounce();
    fireEvent.click(screen.getByRole('button', { name: /Check offers/ }));

    const panel = await screen.findByRole('dialog', { name: /Offer check/i });
    expect(within(panel).getByText('Did not apply')).toBeInTheDocument();
    expect(within(panel).getByText(/1 more needed/)).toBeInTheDocument();
  });

  // The one thing that makes the button trustworthy rather than decorative.
  test('says it is a preview, not the authority', async () => {
    await start();
    addChai();
    await settleDebounce();
    fireEvent.click(screen.getByRole('button', { name: /Check offers/ }));

    const panel = await screen.findByRole('dialog', { name: /Offer check/i });
    expect(within(panel).getByText(/preview, not the authority/)).toBeInTheDocument();
  });
});

// ── Offers at settle ────────────────────────────────────────────────────────
// The cart preview above answers "what will this cost". These answer the
// question that actually moves money: does the figure the cashier COLLECTS
// match the one the server will charge?
//
// It did not. The settle quote was built from the undiscounted lines while the
// settle transaction applied campaign offers on top, so the modal asked for the
// full amount on a bill that posted for less. The ledger booked the lower
// figure correctly — over-tender is change, not revenue — so the shortfall
// showed up as a cash drawer that was over at close, with nothing pointing at
// why.
describe('offers on the bill being settled', () => {
  const ORDER = {
    Id: 'o1', TableId: 'tbl-1', Status: 'open',
    SubTotal: 50, TaxAmount: 0, Total: 50,
    CreatedOn: '2026-08-01 10:00:00',
    Items: [
      { id: 'item-chai', name: 'Masala Chai', qty: 1, price: 25, costInfoId: CI_CHAI },
      { id: 'item-jamun', name: 'Gulab Jamun', qty: 1, price: 25, costInfoId: CI_JAMUN },
    ],
  };

  const openSettle = async () => {
    posService.getTables.mockResolvedValue([{ Id: 'tbl-1', Name: 'T-1', Status: 'occupied' }]);
    posService.getOrders.mockResolvedValue([ORDER]);
    render(<Billing />);
    await screen.findByText('T-1');
    fireEvent.click(screen.getByText('T-1'));
    await waitFor(() => expect(screen.queryByText(/Pick a table to start/i)).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Settle Bill/i }));
    await screen.findByText(/Settle & Post|Save Partial/i);
  };

  test('evaluates offers against the committed rounds, not the empty cart', async () => {
    await openSettle();
    await settleDebounce();

    const call = posService.previewOffers.mock.calls.at(-1);
    expect(call).toBeTruthy();
    const [lines] = call;
    // The same ref the bill stores its line discounts under, and the same one
    // posbill.repository.getOrderLinesTx builds — if these drift, the preview
    // is describing a different bill from the one that gets charged.
    expect(lines.map((l) => l.ref)).toEqual(['o1#0', 'o1#1']);
    expect(lines[0]).toMatchObject({ itemId: 'item-chai', unitAmount: 25, quantity: 1 });
  });

  test('quotes the payable WITH the campaign discount folded in', async () => {
    posService.previewOffers.mockResolvedValue({
      ...NO_OFFERS,
      lineDiscounts: { 'o1#1': { type: 'percent', value: 100 } },
      applied: [{ offerId: 'of-1', campaignName: 'Free dessert', discountAmount: 25 }],
      totalDiscount: 25,
    });

    await openSettle();
    await settleDebounce();

    await waitFor(() => {
      const [lines] = posService.quotePricing.mock.calls.at(-1);
      const jamun = lines.find((l) => l.ref === 'o1#1');
      expect(jamun.discount).toEqual({ type: 'percent', value: 100 });
    });
  });

  test('names the campaign in the settle modal rather than netting it away', async () => {
    posService.previewOffers.mockResolvedValue({
      ...NO_OFFERS,
      lineDiscounts: { 'o1#1': { type: 'percent', value: 100 } },
      applied: [{ offerId: 'of-1', campaignName: 'Free dessert', discountAmount: 25 }],
      totalDiscount: 25,
    });

    await openSettle();
    await settleDebounce();

    expect(await screen.findByText(/Free dessert/)).toBeInTheDocument();
  });

  // Only the lines an offer actually names are touched; the rest stay as the
  // cashier left them. This is the client half of offerEngine.mergeLineDiscounts.
  test('leaves lines the offer does not name untouched', async () => {
    posService.previewOffers.mockResolvedValue({
      ...NO_OFFERS,
      lineDiscounts: { 'o1#1': { type: 'percent', value: 100 } },
      applied: [{ offerId: 'of-1', campaignName: 'Free dessert', discountAmount: 25 }],
      totalDiscount: 25,
    });

    await openSettle();
    await settleDebounce();

    await waitFor(() => {
      const [lines] = posService.quotePricing.mock.calls.at(-1);
      expect(lines.find((l) => l.ref === 'o1#1').discount).toEqual({ type: 'percent', value: 100 });
      expect(lines.find((l) => l.ref === 'o1#0').discount).toBeNull();
    });
  });

  test('prices the bill without offers rather than blocking the sale when the check fails', async () => {
    posService.previewOffers.mockRejectedValue(new Error('offers down'));
    await openSettle();
    await settleDebounce();

    await waitFor(() => expect(posService.quotePricing).toHaveBeenCalled());
    const [lines] = posService.quotePricing.mock.calls.at(-1);
    // The bill still prices — just at full price, exactly as it did before
    // campaigns existed. A failed offer check must never be a failed sale.
    expect(lines.every((l) => !l.discount)).toBe(true);
    expect(lines.length).toBeGreaterThan(0);
  });
});

// ── The cart total must reflect the offer it names ──────────────────────────
// The cart showed the offer on its own row and then totalled as though it had
// not applied: subtotal ₹30, "🎁 −₹15", and ₹30 to pay. Naming a discount and
// then charging as if it did not exist is worse than not showing it — the
// cashier reads the total out loud.
describe('the cart is priced with the offer applied', () => {
  const withOffer = {
    ...NO_OFFERS,
    lineDiscounts: { 'm-chai': { type: 'amount', value: 25 } },
    applied: [{
      offerId: 'of-1', campaignName: 'Launch Offer', discountAmount: 25,
      awards: [{ ref: 'm-chai', quantity: 1, percent: 100, discountAmount: 25 }],
    }],
    totalDiscount: 25,
  };

  test('sends the offer discount to the pricing quote', async () => {
    posService.previewOffers.mockResolvedValue(withOffer);
    await start();
    addChai();
    await settleDebounce();

    await waitFor(() => {
      const [lines] = posService.quotePricing.mock.calls.at(-1);
      expect(lines[0].discount).toEqual({ type: 'amount', value: 25 });
    });
  });

  test('a cart with no offer sends no discount', async () => {
    await start();
    addChai();
    await settleDebounce();

    await waitFor(() => expect(posService.quotePricing).toHaveBeenCalled());
    const [lines] = posService.quotePricing.mock.calls.at(-1);
    expect(lines[0].discount).toBeNull();
  });

});
