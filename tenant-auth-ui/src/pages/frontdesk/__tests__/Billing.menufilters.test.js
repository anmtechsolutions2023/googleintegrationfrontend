import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import Billing from '../Billing';
import posService from '../../../services/posService';

// The till's menu, narrowed. Two controls rather than one: a cashier filters
// "Pizza" and "Veg" together, and the payment modes are on the screen instead
// of hidden in a 90px dropdown.

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
    getPosSettings: jest.fn(), getReceiptFormat: jest.fn(), getLedgerDocument: jest.fn(),
  },
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock('../../../context/AuthContext', () => ({ useAuth: jest.fn() }));
const { useAuth } = require('../../../context/AuthContext');

const BRANCH = 'bbbbbbbb-0000-0000-0000-000000000001';
const CI = 'aaaaaaaa-0000-0000-0000-00000000000';
const MODE_CASH = 'mmmmmmmm-0000-0000-0000-000000000001';
const MODE_CARD = 'mmmmmmmm-0000-0000-0000-000000000002';
const MODE_ZOMATO = 'mmmmmmmm-0000-0000-0000-000000000005';

const dish = (i, name, cat, diet, isVeg) => ({
  Id: `m${i}`, ItemDetailId: `item-m${i}`, CostInfoId: `${CI}${i}`, CostInfoAmount: 100,
  BranchDetailId: BRANCH, VariantIds: [],
  CategoryId: cat ? `cat-${cat}` : null, CategoryName: cat || null,
  FoodTypeName: diet, FoodTypeIsVeg: isVeg ? 1 : 0,
  TaxBreakdown: {
    netAmount: 100, taxAmount: 0, grossAmount: 100,
    effectiveRate: 0, components: [], isTaxIncluded: false,
  },
});

const MENU = [
  dish(1, 'Margherita', 'Pizza', 'Veg', true),
  dish(2, 'BBQ Chicken', 'Pizza', 'Non-Veg', false),
  dish(3, 'Masala Chai', 'Beverages', 'Veg', true),
  dish(4, 'Lime Soda', 'Beverages', 'Vegan', true),
];
const NAMES = {
  'item-m1': 'Margherita', 'item-m2': 'BBQ Chicken',
  'item-m3': 'Masala Chai', 'item-m4': 'Lime Soda',
};

beforeEach(() => {
  useAuth.mockReturnValue({ user: { tid: 't1', onboardingStatus: 'APPROVED',
    scopes: ['POS_ORDER:READ', 'POS_ORDER:WRITE', 'POS_BILLING:READ', 'POS_BILLING:WRITE'] } });
  jest.clearAllMocks();
  posService.getTables.mockResolvedValue([{ Id: 't1', Name: 'T1', Status: 'free' }]);
  posService.getFloors.mockResolvedValue([]);
  posService.getOrders.mockResolvedValue([]);
  posService.getItemMeta.mockResolvedValue(MENU);
  posService.getVariants.mockResolvedValue([]);
  posService.getKots.mockResolvedValue([]);
  posService.getItemDetail.mockImplementation((id) =>
    Promise.resolve({ Id: id, Name: NAMES[id] || id }));
  posService.getPaymentModes.mockResolvedValue([
    { Id: MODE_CASH, Type: 'Cash', AccountName: 'Cash', AccountKind: 'ASSET' },
    { Id: MODE_CARD, Type: 'Card', AccountName: 'Bank', AccountKind: 'ASSET' },
    { Id: MODE_ZOMATO, Type: 'Zomato Settlement', AccountName: 'Aggregator Receivable', AccountKind: 'ASSET' },
  ]);
  posService.getPosSettings.mockResolvedValue({ 'kot.auto_print': 'off' });
  posService.getReceiptFormat.mockResolvedValue(null);
  posService.quotePricing.mockResolvedValue({
    lines: [{ ref: 'm1', costInfoId: `${CI}1`, quantity: 1, netAmount: 100, taxAmount: 0, grossAmount: 100 }],
    totals: { netAmount: 100, taxAmount: 0, grossAmount: 100, discountAmount: 0, taxByComponent: [] },
  });
  posService.createOrder.mockResolvedValue({ id: 'o-counter' });
  posService.fireKot.mockResolvedValue({ KotNo: 'KOT-0001' });
  posService.createBill.mockResolvedValue({ Id: 'b1' });
  posService.settleBill.mockResolvedValue({
    TransactionNo: 'INV-0001', TransactionDetailLogId: 'log-1', Total: 100,
  });
  posService.updateOrder.mockResolvedValue({});
});

// The round the counter order becomes, so the settle modal has something to
// price. Set on the tests that reach payment, not the filter ones.
const PLACED = {
  Id: 'o-counter', TableId: null, OrderType: 'takeaway', Status: 'fired',
  OrderNo: 'ORD-0001', BranchDetailId: BRANCH,
  SubTotal: 100, TaxAmount: 0, Total: 100, CreatedOn: '2026-08-29 10:00:00',
  Items: [{
    name: 'Margherita', costInfoId: `${CI}1`, qty: 1, taxPct: 0,
    netAmount: 100, taxAmount: 0, grossAmount: 100, variantIds: [], taxComponents: [],
  }],
};

const openTill = async () => {
  render(<Billing />);
  await screen.findByText(/Pick a table to start/i);
  fireEvent.click(screen.getByRole('button', { name: /Counter takeaway/i }));
  await screen.findByText('Margherita');
};

const grid = () => document.querySelector('.fd-menu-grid');
const shownDishes = () =>
  [...(grid()?.querySelectorAll('.item-name') || [])].map((el) => el.textContent);
// 'All' exists in BOTH rows — which is correct for the user and ambiguous for a
// query, so every lookup names the row it means.
const inRow = (sel, name) =>
  within(document.querySelector(sel))
    .getByRole('button', { name: new RegExp(`^${name}\\s*\\d*$`) });
const catChip = (name) => inRow('.fd-menu-cats', name);
const dietChip = (name) => inRow('.fd-menu-diets', name);
const chip = (name) => (['Veg', 'Vegan', 'Non-Veg'].includes(name) ? dietChip(name) : catChip(name));

describe('the category rail', () => {
  test('offers every category the menu uses, with All first', async () => {
    await openTill();
    const rail = document.querySelector('.fd-menu-cats');
    const labels = [...rail.querySelectorAll('button')].map((b) => b.textContent.replace(/\d+$/, ''));
    expect(labels).toEqual(['All', 'Beverages', 'Pizza']);
  });

  test('tapping one narrows the grid to it', async () => {
    await openTill();
    expect(shownDishes()).toHaveLength(4);

    fireEvent.click(chip('Beverages'));
    expect(shownDishes().sort()).toEqual(['Lime Soda', 'Masala Chai']);
  });

  test('says which one is on, for a screen reader as well as the eye', async () => {
    await openTill();
    fireEvent.click(catChip('Pizza'));
    expect(catChip('Pizza')).toHaveAttribute('aria-pressed', 'true');
    expect(catChip('All')).toHaveAttribute('aria-pressed', 'false');
    // The diet row is a separate control and is untouched by a category tap.
    expect(dietChip('All')).toHaveAttribute('aria-pressed', 'true');
  });

  test('carries a count so an empty tap is visible before it is made', async () => {
    await openTill();
    const rail = document.querySelector('.fd-menu-cats');
    expect(within(rail).getByText('Pizza').parentElement.textContent).toContain('2');
  });
});

describe('the diet filter', () => {
  test('is a separate control, derived from the tenant\'s own food types', async () => {
    await openTill();
    const row = document.querySelector('.fd-menu-diets');
    const labels = [...row.querySelectorAll('button')].map((b) => b.textContent.replace(/\d+$/, ''));
    expect(labels).toEqual(['All', 'Non-Veg', 'Veg', 'Vegan']);
  });

  test('vegan is its own filter, not swept in with veg', async () => {
    // pos_food_type seeds Vegan with IsVeg = 1, so a filter written against
    // that flag would put Lime Soda under Veg.
    await openTill();
    fireEvent.click(chip('Veg'));
    expect(shownDishes().sort()).toEqual(['Margherita', 'Masala Chai']);

    fireEvent.click(chip('Vegan'));
    expect(shownDishes()).toEqual(['Lime Soda']);
  });

  test('combines with the category — the whole point of two controls', async () => {
    await openTill();
    fireEvent.click(chip('Pizza'));
    fireEvent.click(chip('Non-Veg'));
    expect(shownDishes()).toEqual(['BBQ Chicken']);
  });

  test('counts follow the selected category', async () => {
    await openTill();
    fireEvent.click(chip('Beverages'));
    const row = document.querySelector('.fd-menu-diets');
    // No non-veg beverage: the chip says 0 rather than emptying the grid on tap.
    expect(within(row).getByText('Non-Veg').parentElement.textContent).toContain('0');
  });
});

describe('when nothing matches', () => {
  test('says so and offers the way out', async () => {
    await openTill();
    fireEvent.click(chip('Beverages'));
    fireEvent.click(chip('Non-Veg'));

    expect(screen.getByText(/Nothing matches these filters/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Clear filters/i }));
    expect(shownDishes()).toHaveLength(4);
  });

  test('a search inside a category that cannot match is escapable', async () => {
    await openTill();
    fireEvent.click(chip('Beverages'));
    fireEvent.change(screen.getByPlaceholderText(/Search menu/i), { target: { value: 'margh' } });

    expect(screen.getByText(/Nothing matches these filters/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Clear filters/i }));
    expect(shownDishes()).toEqual(expect.arrayContaining(['Margherita']));
  });
});

describe('a menu with nothing to filter by', () => {
  test('shows no rail rather than a row containing only All', async () => {
    posService.getItemMeta.mockResolvedValue([
      { ...dish(1, 'Margherita', null, 'Veg', true) },
      { ...dish(2, 'BBQ Chicken', null, 'Veg', true) },
    ]);
    await openTill();
    expect(document.querySelector('.fd-menu-cats')).toBeNull();
    expect(document.querySelector('.fd-menu-diets')).toBeNull();
  });

  test('an uncategorised dish is still sellable', async () => {
    posService.getItemMeta.mockResolvedValue([
      dish(1, 'Margherita', 'Pizza', 'Veg', true),
      { ...dish(2, 'BBQ Chicken', null, 'Non-Veg', false) },
    ]);
    await openTill();
    expect(shownDishes()).toEqual(expect.arrayContaining(['BBQ Chicken']));

    fireEvent.click(chip('Uncategorised'));
    expect(shownDishes()).toEqual(['BBQ Chicken']);
  });
});

// ── Settle Bill: how it is paid, on the screen ──────────────────────────────
// The mode was a `select { flex: 0 0 90px }` — every option behind a tap, and
// 'District Settlement' rendered as 'District S…'. These pin the replacement,
// and above all that it did not quietly cost us split settlement.

const settle = async () => {
  posService.getOrders.mockResolvedValue([PLACED]);
  await openTill();
  fireEvent.click(screen.getByText('Margherita'));
  await waitFor(() => expect(posService.quotePricing).toHaveBeenCalled());
  fireEvent.click(screen.getByRole('button', { name: /Place & Pay/i }));
  await screen.findByText('Amount Payable');
};

describe('paying, on the screen', () => {
  test('every mode is visible without opening anything', async () => {
    await settle();
    const modes = screen.getAllByRole('radio');
    expect(modes.map((r) => r.closest('label').textContent))
      .toEqual(expect.arrayContaining([
        expect.stringContaining('Cash'),
        expect.stringContaining('Card'),
        expect.stringContaining('Zomato Settlement'),
      ]));
  });

  test('a long mode name is not cut off', async () => {
    // The whole complaint: 90px turned this into 'District S…'.
    await settle();
    expect(screen.getByText('Zomato Settlement')).toBeInTheDocument();
  });

  test('each mode says where the money lands', async () => {
    // A counter sale settled to a portal books to a receivable, not the
    // drawer, and leaves the cash session short with nothing to explain it.
    await settle();
    const zomato = screen.getByRole('radio', { name: /Zomato Settlement/i });
    expect(zomato.closest('label').textContent).toContain('Aggregator Receivable');
    expect(screen.getByRole('radio', { name: /^Cash/i }).closest('label').textContent)
      .toContain('Cash');
  });

  test('is a real radio group, so the keyboard and a screen reader work', async () => {
    await settle();
    expect(screen.getByRole('radiogroup', { name: /Payment mode/i })).toBeInTheDocument();
    const cash = screen.getByRole('radio', { name: /^Cash/i });
    expect(cash).toBeChecked();
  });

  test('picking one selects it and deselects the last', async () => {
    await settle();
    fireEvent.click(screen.getByRole('radio', { name: /^Card/i }));
    expect(screen.getByRole('radio', { name: /^Card/i })).toBeChecked();
    expect(screen.getByRole('radio', { name: /^Cash/i })).not.toBeChecked();
  });

  test('the reference field still appears only where reconciliation needs it', async () => {
    await settle();
    expect(screen.queryByLabelText('Reference number')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /^Card/i }));
    expect(screen.getByLabelText('Reference number')).toBeInTheDocument();
  });

  test('SPLIT SETTLEMENT SURVIVES — each payment keeps its own choice', async () => {
    // Radios that allowed only one mode for the whole bill would have removed
    // split settlement without anyone noticing until the ledger was wrong.
    await settle();
    fireEvent.click(screen.getByRole('button', { name: /Split payment/i }));

    const groups = screen.getAllByRole('radiogroup');
    expect(groups).toHaveLength(2);

    fireEvent.click(within(groups[1]).getByRole('radio', { name: /^Card/i }));
    expect(within(groups[0]).getByRole('radio', { name: /^Cash/i })).toBeChecked();
    expect(within(groups[1]).getByRole('radio', { name: /^Card/i })).toBeChecked();
  });

  test('a split posts both tenders, each with the mode it was given', async () => {
    posService.createBill.mockResolvedValue({ Id: 'b1' });
    posService.settleBill.mockResolvedValue({
      TransactionNo: 'INV-0001', TransactionDetailLogId: 'log-1', Total: 100,
    });
    await settle();
    fireEvent.click(screen.getByRole('button', { name: /Split payment/i }));

    const groups = screen.getAllByRole('radiogroup');
    fireEvent.click(within(groups[1]).getByRole('radio', { name: /^Card/i }));
    const amounts = screen.getAllByLabelText(/^Payment \d+ amount$/);
    fireEvent.change(amounts[0], { target: { value: '60' } });
    fireEvent.change(amounts[1], { target: { value: '40' } });
    fireEvent.change(screen.getByLabelText('Reference number'), { target: { value: 'AUTH-9' } });

    fireEvent.click(screen.getByRole('button', { name: /Settle & Post|Save Partial/i }));
    await waitFor(() => expect(posService.settleBill).toHaveBeenCalled());

    const [, payload] = posService.settleBill.mock.calls[0];
    expect(payload.Tenders).toHaveLength(2);
    expect(payload.Tenders[0]).toMatchObject({ paymentModeId: MODE_CASH, amount: 60 });
    expect(payload.Tenders[1]).toMatchObject({ paymentModeId: MODE_CARD, amount: 40 });
  });
});
