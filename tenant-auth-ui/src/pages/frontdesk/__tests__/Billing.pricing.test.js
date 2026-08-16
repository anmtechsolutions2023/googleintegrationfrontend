import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import Billing from '../Billing';
import posService from '../../../services/posService';

jest.mock('../../../services/posService', () => ({
  __esModule: true,
  default: {
    getTables: jest.fn(), getFloors: jest.fn(), getItemMeta: jest.fn(),
    getOrders: jest.fn(), getItemDetail: jest.fn(), getVariants: jest.fn(),
    getPaymentModes: jest.fn(),
    getKots: jest.fn(),
    quotePricing: jest.fn(),
    createOrder: jest.fn(), updateOrder: jest.fn(), updateTable: jest.fn(),
    transferOrder: jest.fn(), deleteOrder: jest.fn(),
    fireKot: jest.fn(), createBill: jest.fn(), settleBill: jest.fn(),
  },
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

const CI_DOSA = 'aaaaaaaa-0000-0000-0000-000000000001';
const CI_WATER = 'aaaaaaaa-0000-0000-0000-000000000002';

const VAR_LARGE = 'vvvvvvvv-0000-0000-0000-000000000001';
const VAR_CHEESE = 'vvvvvvvv-0000-0000-0000-000000000002';

const MODE_CASH = 'mmmmmmmm-0000-0000-0000-000000000001';
const MODE_CARD = 'mmmmmmmm-0000-0000-0000-000000000002';
const PAYMENT_MODES = [
  { Id: MODE_CASH, Type: 'Cash' },
  { Id: MODE_CARD, Type: 'Card' },
];

const VARIANTS = [
  { Id: VAR_LARGE, Name: 'Large', Price: 30 },
  { Id: VAR_CHEESE, Name: 'Extra Cheese', Price: 20 },
];

// A menu row as the API now returns it: CostInfoId + server-resolved TaxBreakdown.
const menuRow = (id, name, costInfoId, amount, rate, opts = {}) => ({
  Id: id,
  ItemDetailId: `item-${id}`,
  CostInfoId: costInfoId,
  CostInfoAmount: amount,
  FoodTypeName: 'Veg',
  FoodTypeIsVeg: 1,
  VariantIds: opts.variantIds || [],
  TaxBreakdown: costInfoId
    ? {
        netAmount: amount, taxAmount: 0, grossAmount: amount,
        effectiveRate: rate, components: [],
        isTaxIncluded: !!opts.isTaxIncluded,
      }
    : null,
});

const MENU = [
  menuRow('m1', 'Masala Dosa', CI_DOSA, 100, 18, { variantIds: [VAR_LARGE, VAR_CHEESE] }),
  menuRow('m2', 'Water', CI_WATER, 20, 0),
];

const QUOTE = {
  lines: [
    {
      ref: 'm1', costInfoId: CI_DOSA, quantity: 1,
      netAmount: 100, taxAmount: 18, grossAmount: 118,
      components: [
        { name: 'CGST', rate: 9, amount: 9 },
        { name: 'SGST', rate: 9, amount: 9 },
      ],
    },
  ],
  totals: {
    netAmount: 100, taxAmount: 18, grossAmount: 118, discountAmount: 0,
    taxByComponent: [
      { name: 'CGST', rate: 9, amount: 9 },
      { name: 'SGST', rate: 9, amount: 9 },
    ],
  },
};

// The menu is inert until a table is chosen — that is the required flow now, so
// the shared setup follows it. Tests that need the LOCKED state ask for it
// explicitly with { table: null }.
// A table has to exist for the menu to be reachable at all.
const DEFAULT_TABLE = { Id: 'tbl-default', Name: 'T-1', Status: 'free' };

const renderBilling = async ({ table } = {}) => {
  render(<Billing />);
  // Billing opens on the floor plan — picking a table is step one, and the rest
  // of the screen does not exist until it happens.
  await screen.findByText(/Pick a table to start/i);

  if (table === null) return; // stay on the floor plan

  selectTable(table);
  await waitFor(() =>
    expect(screen.queryByText(/Pick a table to start/i)).not.toBeInTheDocument());
};

// Once an item is in the cart its name appears twice (menu card + cart row),
// so always click the MENU card specifically.
const clickDosaCard = () => {
  const card = screen.getAllByText('Masala Dosa').find(
    (el) => el.className === 'item-name',
  );
  fireEvent.click(card);
};

// Masala Dosa offers variants, so clicking it opens the picker. Most tests do
// not care about options and take the plain item.
const addDosaToCart = () => {
  clickDosaCard();
  fireEvent.click(screen.getByRole('button', { name: /Skip Options/i }));
};

// Tables are buttons on the floor plan — one tap, no dropdown. Their accessible
// name carries the status and running total, so match on the visible name node.
const selectTable = (label) => {
  const cards = screen.getAllByRole('button').filter((b) => b.classList.contains('fd-tablecard'));
  const card = label
    ? cards.find((b) => within(b).queryByText(label))
    : cards[0];
  if (!card) throw new Error(`No table card for ${label || '(first)'}`);
  fireEvent.click(card);
};

// Once a table is chosen the floor plan is gone; going back is the header's
// "Change table".
const changeTable = () => {
  fireEvent.click(screen.getByRole('button', { name: /Change table/i }));
};

beforeEach(() => {
  posService.getTables.mockResolvedValue([DEFAULT_TABLE]);
  posService.getFloors.mockResolvedValue([]);
  posService.getOrders.mockResolvedValue([]);
  posService.getItemMeta.mockResolvedValue(MENU);
  posService.getVariants.mockResolvedValue(VARIANTS);
  posService.getPaymentModes.mockResolvedValue(PAYMENT_MODES);
  posService.getItemDetail.mockImplementation(async (id) => ({
    Id: id, Name: id === 'item-m1' ? 'Masala Dosa' : 'Water',
  }));
  posService.quotePricing.mockResolvedValue(QUOTE);
  posService.getKots.mockResolvedValue([]);
});

afterEach(() => jest.clearAllMocks());

describe('Billing — menu grid', () => {
  test('flags an exclusive price — tax will be added at the till', async () => {
    await renderBilling();
    const flag = screen.getByText('+ 18% tax');
    expect(flag).toHaveClass('tax-flag', 'excl');
  });

  test('flags an inclusive price differently', async () => {
    posService.getItemMeta.mockResolvedValue([
      menuRow('m9', 'Combo', CI_DOSA, 100, 18, { isTaxIncluded: true }),
    ]);
    posService.getItemDetail.mockResolvedValue({ Id: 'item-m9', Name: 'Combo' });
    await renderBilling();
    await screen.findByText('Combo');

    const flag = screen.getByText('incl. 18% tax');
    expect(flag).toHaveClass('tax-flag', 'incl');
  });

  test('omits the flag for a zero-rated item', async () => {
    await renderBilling();
    expect(screen.queryByText(/0% tax/)).not.toBeInTheDocument();
  });

  test('marks items that offer options', async () => {
    await renderBilling();
    expect(screen.getByText('Options available')).toBeInTheDocument();
  });
});

describe('Billing — cart totals come from the server', () => {
  test('quotes the cart against /api/pricing/quote', async () => {
    await renderBilling();
    addDosaToCart();

    await waitFor(() => expect(posService.quotePricing).toHaveBeenCalled());
    const [lines] = posService.quotePricing.mock.calls.at(-1);
    expect(lines).toEqual([
      { costInfoId: CI_DOSA, quantity: 1, variantIds: [], ref: 'm1' },
    ]);
  });

  test('shows the server tax and total, not a locally computed one', async () => {
    await renderBilling();
    addDosaToCart();

    await waitFor(() => expect(screen.getByText('₹18.00')).toBeInTheDocument());
    expect(screen.getByText('₹118.00')).toBeInTheDocument();
  });

  test('renders a CGST/SGST breakdown that sums to the tax row', async () => {
    await renderBilling();
    addDosaToCart();

    await waitFor(() => expect(screen.getByText('CGST @ 9%')).toBeInTheDocument());
    expect(screen.getByText('SGST @ 9%')).toBeInTheDocument();
    // 9 + 9 = 18, the Tax row.
    expect(screen.getAllByText('₹9.00')).toHaveLength(2);
  });

  test('re-quotes when the quantity changes', async () => {
    await renderBilling();
    addDosaToCart();
    await waitFor(() => expect(posService.quotePricing).toHaveBeenCalledTimes(1));

    addDosaToCart(); // same item again → qty 2
    await waitFor(() => expect(posService.quotePricing).toHaveBeenCalledTimes(2));
    const [lines] = posService.quotePricing.mock.calls.at(-1);
    expect(lines[0].quantity).toBe(2);
  });

  test('does not quote an empty cart', async () => {
    await renderBilling();
    expect(posService.quotePricing).not.toHaveBeenCalled();
  });

  test('falls back to the untaxed subtotal when the quote fails', async () => {
    // A pricing outage must not stop staff taking orders.
    posService.quotePricing.mockRejectedValue(new Error('network'));
    await renderBilling();
    addDosaToCart();

    await waitFor(() => expect(posService.quotePricing).toHaveBeenCalled());
    expect(await screen.findByText('₹0.00')).toBeInTheDocument(); // tax row
    expect(screen.getAllByText('₹100.00').length).toBeGreaterThan(0); // subtotal = total
  });

  test('skips lines with no cost link', async () => {
    posService.getItemMeta.mockResolvedValue([menuRow('m3', 'Freebie', null, 0, 0)]);
    posService.getItemDetail.mockResolvedValue({ Id: 'item-m3', Name: 'Freebie' });
    await renderBilling();
    await screen.findByText('Freebie');
    fireEvent.click(screen.getByText('Freebie'));

    // Nothing priceable in the cart → no pointless round trip.
    await waitFor(() => expect(posService.quotePricing).not.toHaveBeenCalled());
  });
});

describe('Billing — variant picker', () => {
  const openPicker = async () => {
    await renderBilling();
    clickDosaCard();
    await screen.findByRole('dialog', { name: /Choose options/i });
  };

  test('opens for an item that offers options', async () => {
    await openPicker();
    expect(screen.getByText('Large')).toBeInTheDocument();
    expect(screen.getByText('Extra Cheese')).toBeInTheDocument();
    expect(screen.getByText('+₹30.00')).toBeInTheDocument();
  });

  test('does NOT open for an item with no options — adds straight away', async () => {
    await renderBilling();
    fireEvent.click(screen.getAllByText('Water').find((el) => el.className === 'item-name'));
    expect(screen.queryByRole('dialog', { name: /Choose options/i })).not.toBeInTheDocument();
    await waitFor(() => expect(posService.quotePricing).toHaveBeenCalled());
  });

  test('shows a running item total as options are ticked', async () => {
    await openPicker();
    // Scope to the dialog — the menu card behind it shows the base price too.
    const dialog = screen.getByRole('dialog', { name: /Choose options/i });
    expect(within(dialog).getByText('₹100.00')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('checkbox', { name: /Large/i }));
    expect(within(dialog).getByText('₹130.00')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('checkbox', { name: /Extra Cheese/i }));
    expect(within(dialog).getByText('₹150.00')).toBeInTheDocument();
  });

  test('sends the selected variantIds to be priced', async () => {
    await openPicker();
    fireEvent.click(screen.getByRole('checkbox', { name: /Large/i }));
    fireEvent.click(screen.getByRole('button', { name: /Add to Order/i }));

    await waitFor(() => expect(posService.quotePricing).toHaveBeenCalled());
    const [lines] = posService.quotePricing.mock.calls.at(-1);
    expect(lines[0].variantIds).toEqual([VAR_LARGE]);
  });

  test('Skip Options adds the plain item', async () => {
    await openPicker();
    fireEvent.click(screen.getByRole('button', { name: /Skip Options/i }));

    await waitFor(() => expect(posService.quotePricing).toHaveBeenCalled());
    const [lines] = posService.quotePricing.mock.calls.at(-1);
    expect(lines[0].variantIds).toEqual([]);
  });

  test('Cancel adds nothing', async () => {
    await openPicker();
    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/i }));
    expect(screen.queryByRole('dialog', { name: /Choose options/i })).not.toBeInTheDocument();
    await waitFor(() => expect(posService.quotePricing).not.toHaveBeenCalled());
  });

  test('shows the chosen options as chips on the cart line', async () => {
    await openPicker();
    fireEvent.click(screen.getByRole('checkbox', { name: /Large/i }));
    fireEvent.click(screen.getByRole('button', { name: /Add to Order/i }));

    await waitFor(() => expect(screen.getByText('Large +₹30.00')).toBeInTheDocument());
  });

  test('same item with different options is a SEPARATE cart line', async () => {
    await openPicker();
    fireEvent.click(screen.getByRole('checkbox', { name: /Large/i }));
    fireEvent.click(screen.getByRole('button', { name: /Add to Order/i }));
    await waitFor(() => expect(posService.quotePricing).toHaveBeenCalledTimes(1));

    // Add the same dish again, this time plain.
    clickDosaCard();
    fireEvent.click(await screen.findByRole('button', { name: /Skip Options/i }));

    await waitFor(() => {
      const [lines] = posService.quotePricing.mock.calls.at(-1);
      // Two lines, each qty 1 — not one line of qty 2.
      expect(lines).toHaveLength(2);
      expect(lines.every((l) => l.quantity === 1)).toBe(true);
    });
  });

  test('re-selecting the identical options increments the existing line', async () => {
    await openPicker();
    fireEvent.click(screen.getByRole('checkbox', { name: /Large/i }));
    fireEvent.click(screen.getByRole('button', { name: /Add to Order/i }));
    await waitFor(() => expect(posService.quotePricing).toHaveBeenCalledTimes(1));

    clickDosaCard();
    fireEvent.click(await screen.findByRole('checkbox', { name: /Large/i }));
    fireEvent.click(screen.getByRole('button', { name: /Add to Order/i }));

    await waitFor(() => {
      const [lines] = posService.quotePricing.mock.calls.at(-1);
      expect(lines).toHaveLength(1);
      expect(lines[0].quantity).toBe(2);
    });
  });
});

describe('Billing — settle sends every round and lets the server total it', () => {
  const ORDERS = [
    { Id: 'o1', TableId: 't1', Status: 'open', SubTotal: 100, TaxAmount: 18, Total: 118, CreatedOn: '2026-07-01 10:00:00', Items: [] },
    { Id: 'o2', TableId: 't1', Status: 'open', SubTotal: 50, TaxAmount: 9, Total: 59, CreatedOn: '2026-07-01 10:30:00', Items: [] },
  ];

  const openSettle = async () => {
    posService.getTables.mockResolvedValue([
      { Id: 't1', Name: 'T1', Status: 'occupied' },
    ]);
    posService.getOrders.mockResolvedValue(ORDERS);
    posService.createBill.mockResolvedValue({ Id: 'b1', Total: 141.6 });
    posService.settleBill.mockResolvedValue({});
    posService.updateOrder.mockResolvedValue({});
    posService.updateTable.mockResolvedValue({});

    await renderBilling({ table: 'T1' });
    fireEvent.click(screen.getByRole('button', { name: /Settle Bill/i }));
    await screen.findByText(/Settle & Post|Save Partial/i);
  };

  test('sends OrderIds for every round, not just the first', async () => {
    await openSettle();
    fireEvent.click(screen.getByRole('button', { name: /Settle & Post|Save Partial/i }));

    await waitFor(() => expect(posService.createBill).toHaveBeenCalled());
    const [payload] = posService.createBill.mock.calls[0];
    // The whole point: a bill covering 2 rounds must name both.
    expect(payload.OrderIds).toEqual(['o1', 'o2']);
  });

  test('does not compute totals locally — the server owns them', async () => {
    await openSettle();
    fireEvent.click(screen.getByRole('button', { name: /Settle & Post|Save Partial/i }));

    await waitFor(() => expect(posService.createBill).toHaveBeenCalled());
    const [payload] = posService.createBill.mock.calls[0];
    expect(payload).not.toHaveProperty('SubTotal');
    expect(payload).not.toHaveProperty('TaxAmount');
    expect(payload).not.toHaveProperty('Total');
  });

  test('settles for the amount the server calculated', async () => {
    await openSettle();
    fireEvent.change(screen.getByLabelText("Discount", { selector: "input" }), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: /Settle & Post|Save Partial/i }));

    await waitFor(() => expect(posService.settleBill).toHaveBeenCalled());
    const [, settlePayload] = posService.settleBill.mock.calls[0];
    // One tender row per payment — this is what becomes a paymentbreakup.
    expect(settlePayload.Tenders).toHaveLength(1);
    // Discount-before-tax gives 141.60; the till collects the ledger's rounded
    // payable of ₹142, not the paise. The old flow would have paid 147.
    expect(settlePayload.Tenders[0].amount).toBe(142);
    expect(settlePayload.Tenders[0].paymentModeId).toBe(MODE_CASH);
    expect(settlePayload.Discount).toBe(30);
  });

  test('tells the user the discount is applied before tax', async () => {
    await openSettle();
    expect(screen.getByText(/reduces the taxable amount/i)).toBeInTheDocument();
  });
});

// The ledger invoices a WHOLE-RUPEE payable and books the paise as RoundOff.
// While the settle screen worked to the unrounded gross, a bill of ₹638.88 was
// tendered in full and still posted PARTIALLY_PAID — 12 paise short of the
// ₹639.00 invoice, with nothing on screen to explain the gap.
describe('Billing — payable is rounded the way the ledger invoices it', () => {
  const ORDERS = [
    { Id: 'o1', TableId: 't1', Status: 'open', SubTotal: 556.94, TaxAmount: 81.94, Total: 638.88, CreatedOn: '2026-07-01 10:00:00', Items: [] },
  ];

  const openSettle = async () => {
    posService.getTables.mockResolvedValue([{ Id: 't1', Name: 'T1', Status: 'occupied' }]);
    posService.getOrders.mockResolvedValue(ORDERS);
    posService.createBill.mockResolvedValue({ Id: 'b1', Total: 639 });
    posService.settleBill.mockResolvedValue({});
    posService.updateOrder.mockResolvedValue({});
    posService.updateTable.mockResolvedValue({});
    await renderBilling({ table: 'T1' });
    fireEvent.click(screen.getByRole('button', { name: /Settle Bill/i }));
    await screen.findByText(/Settle & Post|Save Partial/i);
  };

  test('asks for the rounded rupee and shows where the paise went', async () => {
    await openSettle();
    expect(screen.getByRole('button', { name: /Settle & Post ₹639\.00/ })).toBeInTheDocument();
    expect(screen.getByText('Round off')).toBeInTheDocument();
    expect(screen.getByText('+₹0.12')).toBeInTheDocument();
  });

  test('a cash + UPI split covering the bill leaves nothing due', async () => {
    await openSettle();
    // Cashier takes ₹500 cash, then adds a second tender for the remainder —
    // which must be ₹139.00, not the ₹138.88 that left the sale 12p short.
    const amounts = screen.getAllByLabelText(/Amount/i);
    fireEvent.change(amounts[0], { target: { value: '500' } });
    fireEvent.click(screen.getByRole('button', { name: /Add payment/i }));

    const [, second] = screen.getAllByLabelText(/Amount/i);
    expect(second).toHaveValue(139);

    fireEvent.click(screen.getByRole('button', { name: /Settle & Post|Save Partial/i }));
    await waitFor(() => expect(posService.settleBill).toHaveBeenCalled());
    const [, settlePayload] = posService.settleBill.mock.calls[0];
    const paid = settlePayload.Tenders.reduce((s, t) => s + t.amount, 0);
    expect(paid).toBe(639);
  });
});

describe('Billing — multi-round bill summary', () => {
  const dosaItem = {
    name: 'Masala Dosa', costInfoId: CI_DOSA, qty: 1, taxPct: 18, isTaxIncluded: false,
    netAmount: 100, taxAmount: 18, grossAmount: 118, variantIds: [],
    taxComponents: [{ name: 'CGST', rate: 9, amount: 9 }, { name: 'SGST', rate: 9, amount: 9 }],
  };
  const waterItem = {
    name: 'Water', costInfoId: CI_WATER, qty: 1, taxPct: 0, isTaxIncluded: false,
    netAmount: 20, taxAmount: 0, grossAmount: 20, variantIds: [], taxComponents: [],
  };
  const ROUNDS = [
    { Id: 'o1', TableId: 't1', Status: 'open', OrderNo: 'ORD-748310', SubTotal: 100, TaxAmount: 18, Total: 118, CreatedOn: '2026-07-01 10:00:00', Items: [dosaItem] },
    { Id: 'o2', TableId: 't1', Status: 'open', OrderNo: 'ORD-755831', SubTotal: 20, TaxAmount: 0, Total: 20, CreatedOn: '2026-07-01 10:30:00', Items: [waterItem] },
  ];

  const openSession = async () => {
    posService.getTables.mockResolvedValue([{ Id: 't1', Name: 'T1', Status: 'occupied' }]);
    posService.getOrders.mockResolvedValue(ROUNDS);
    await renderBilling({ table: 'T1' });
  };

  test('shows a per-round total for each round and one grand total', async () => {
    await openSession();
    expect(await screen.findByText('Round 1 total')).toBeInTheDocument();
    expect(screen.getByText('Round 2 total')).toBeInTheDocument();
    expect(screen.getByText('Grand Total')).toBeInTheDocument();
    // 118 + 20 = 138 across the two rounds.
    expect(screen.getByText('₹138.00')).toBeInTheDocument();
  });

  test('item-wise GST breakup shows how much tax each product carries', async () => {
    await openSession();
    fireEvent.click(await screen.findByRole('button', { name: /GST by item/i }));
    // Dosa is taxed 18%, water is 0% — both appear in the item-wise breakup
    // table (Water also shows in the menu grid, so scope to the table).
    const table = screen.getByRole('table');
    expect(within(table).getByText('18%')).toBeInTheDocument();
    expect(within(table).getByText('Water')).toBeInTheDocument();
    expect(within(table).getByText('Masala Dosa')).toBeInTheDocument();
  });
});

describe('Billing — settle preview updates with the discount', () => {
  const dosaItem = {
    name: 'Masala Dosa', costInfoId: CI_DOSA, qty: 1, taxPct: 18, isTaxIncluded: false,
    netAmount: 100, taxAmount: 18, grossAmount: 118, variantIds: [],
    taxComponents: [{ name: 'CGST', rate: 9, amount: 9 }, { name: 'SGST', rate: 9, amount: 9 }],
  };
  const ORDERS = [
    { Id: 'o1', TableId: 't1', Status: 'open', OrderNo: 'ORD-1', SubTotal: 100, TaxAmount: 18, Total: 118, CreatedOn: '2026-07-01 10:00:00', Items: [dosaItem] },
  ];

  const openSettle = async () => {
    posService.getTables.mockResolvedValue([{ Id: 't1', Name: 'T1', Status: 'occupied' }]);
    posService.getOrders.mockResolvedValue(ORDERS);
    posService.createBill.mockResolvedValue({ Id: 'b1', Total: 100 });
    posService.settleBill.mockResolvedValue({});
    posService.updateOrder.mockResolvedValue({});
    posService.updateTable.mockResolvedValue({});
    // The settle preview re-quotes with the discount folded in (before tax).
    posService.quotePricing.mockImplementation(async (lines, discount) => {
      const d = discount?.value || 0;
      const net = 100 - d;
      const tax = Math.round(net * 0.18 * 100) / 100;
      return { lines: [], totals: { netAmount: net, taxAmount: tax, grossAmount: net + tax, discountAmount: d, taxByComponent: [] } };
    });
    await renderBilling({ table: 'T1' });
    fireEvent.click(screen.getByRole('button', { name: /Settle Bill/i }));
    await screen.findByText('Amount Payable');
  };

  test('shows the payable and reprices it live as the discount changes', async () => {
    await openSettle();
    // No discount → payable is the full 118.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Settle & Post ₹118\.00/ })).toBeInTheDocument()
    );

    // ₹20 off, before tax: (100−20) + 18% = 94.40, asked for as ₹94 — the
    // ledger rounds the payable to the rupee and books the 40p as RoundOff.
    fireEvent.change(screen.getByLabelText("Discount", { selector: "input" }), { target: { value: '20' } });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Settle & Post ₹94\.00/ })).toBeInTheDocument()
    );
    expect(screen.getByText('−₹0.40')).toBeInTheDocument();
    expect(screen.getByText('−₹20.00')).toBeInTheDocument();
  });

  test('supports a percentage discount and quotes it as a percent', async () => {
    await openSettle();
    // Switch to % mode, then 10% off (net 100 → 90, +18% = 106.20).
    fireEvent.click(screen.getByRole('button', { name: '%', exact: true }));
    fireEvent.change(screen.getByLabelText("Discount", { selector: "input" }), { target: { value: '10' } });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Settle & Post ₹106\.00/ })).toBeInTheDocument()
    );
    // The quote must have been asked for a PERCENT discount, not a flat amount.
    await waitFor(() => {
      const [, discount] = posService.quotePricing.mock.calls.at(-1);
      expect(discount).toEqual({ type: 'percent', value: 10 });
    });
  });

  test('sends the resolved ₹ discount to the bill even for a percentage', async () => {
    await openSettle();
    fireEvent.click(screen.getByRole('button', { name: '%', exact: true }));
    fireEvent.change(screen.getByLabelText("Discount", { selector: "input" }), { target: { value: '10' } });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Settle & Post ₹106\.00/ })).toBeInTheDocument()
    );

    fireEvent.click(screen.getByRole('button', { name: /Settle & Post|Save Partial/i }));
    await waitFor(() => expect(posService.createBill).toHaveBeenCalled());
    const [payload] = posService.createBill.mock.calls[0];
    // 10% of the 100 subtotal = ₹10 sent as a flat amount the bill understands.
    expect(payload.Discount).toBe(10);
  });
});

// A discount given on one dish is a decision someone made about that product; a
// bill discount is spread across whatever happened to be on the bill. They are
// captured, stored and reported separately for exactly that reason.
describe('Billing — per-item discount', () => {
  const dosa = {
    name: 'Masala Dosa', costInfoId: CI_DOSA, qty: 1, taxPct: 18, isTaxIncluded: false,
    netAmount: 100, taxAmount: 18, grossAmount: 118, variantIds: [], taxComponents: [],
  };
  const ORDERS = [
    { Id: 'o1', TableId: 't1', Status: 'open', OrderNo: 'ORD-1', SubTotal: 100, TaxAmount: 18, Total: 118, CreatedOn: '2026-07-01 10:00:00', Items: [dosa] },
  ];

  const openSettle = async () => {
    posService.getTables.mockResolvedValue([{ Id: 't1', Name: 'T1', Status: 'occupied' }]);
    posService.getOrders.mockResolvedValue(ORDERS);
    posService.getKots.mockResolvedValue([{ OrderId: 'o1', Status: 'pending' }]);
    posService.createBill.mockResolvedValue({ Id: 'b1', Total: 100 });
    posService.settleBill.mockResolvedValue({});
    posService.updateOrder.mockResolvedValue({});
    posService.updateTable.mockResolvedValue({});
    posService.quotePricing.mockImplementation(async (lines) => {
      const item = Number(lines[0]?.discount?.value) || 0;
      const net = 100 - item;
      return {
        lines: [{ ref: lines[0]?.ref, itemDiscountAmount: item, billDiscountAmount: 0 }],
        totals: { netAmount: net, taxAmount: 0, grossAmount: net, discountAmount: item, taxByComponent: [] },
      };
    });
    await renderBilling({ table: 'T1' });
    fireEvent.click(screen.getByRole('button', { name: /Settle Bill/i }));
    await screen.findByText('Amount Payable');
    fireEvent.click(screen.getByRole('button', { name: /Per item/i }));
  };

  test('quotes the discount against the line the cashier typed it on', async () => {
    await openSettle();
    fireEvent.change(screen.getByLabelText(/Discount for Masala Dosa/i), { target: { value: '20' } });

    await waitFor(() => {
      const [lines] = posService.quotePricing.mock.calls.at(-1);
      expect(lines[0].discount).toEqual({ type: 'amount', value: 20 });
      expect(lines[0].ref).toBe('o1#0');
    });
  });

  test('sends per-item discounts under the ref the bill stores them by', async () => {
    await openSettle();
    fireEvent.change(screen.getByLabelText(/Discount for Masala Dosa/i), { target: { value: '20' } });
    await waitFor(() => expect(posService.quotePricing).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /Settle & Post|Save Partial/i }));
    await waitFor(() => expect(posService.createBill).toHaveBeenCalled());

    const [payload] = posService.createBill.mock.calls[0];
    expect(payload.LineDiscounts).toEqual({ 'o1#0': { type: 'amount', value: 20 } });
    // The bill's own Discount covers the WHOLE-BILL reduction only. Including
    // the item discount here would take it off twice.
    expect(payload.Discount).toBe(0);
  });

  // The ₹/% choice is made BEFORE the number is typed. Dropping the row's draft
  // while its value was still empty snapped the choice back to ₹, so % could
  // never be selected at all — the toggle looked dead.
  test('keeps % selected on an empty row so a percentage can be typed at all', async () => {
    await openSettle();
    const percent = within(
      screen.getByRole('group', { name: /Discount type for Masala Dosa/i }),
    ).getByRole('button', { name: '%' });

    fireEvent.click(percent);
    expect(percent).toHaveAttribute('aria-pressed', 'true');

    fireEvent.change(screen.getByLabelText(/Discount for Masala Dosa/i), { target: { value: '10' } });
    await waitFor(() => {
      const [lines] = posService.quotePricing.mock.calls.at(-1);
      expect(lines[0].discount).toEqual({ type: 'percent', value: 10 });
    });
  });

  test('an empty row with a type chosen prices and stores nothing', async () => {
    await openSettle();
    fireEvent.click(within(
      screen.getByRole('group', { name: /Discount type for Masala Dosa/i }),
    ).getByRole('button', { name: '%' }));

    fireEvent.click(screen.getByRole('button', { name: /Settle & Post|Save Partial/i }));
    await waitFor(() => expect(posService.createBill).toHaveBeenCalled());
    expect(posService.createBill.mock.calls[0][0].LineDiscounts).toEqual({});
  });

  test('clearing the input removes the discount rather than storing a zero', async () => {
    await openSettle();
    const input = screen.getByLabelText(/Discount for Masala Dosa/i);
    fireEvent.change(input, { target: { value: '20' } });
    fireEvent.change(input, { target: { value: '' } });
    await waitFor(() => expect(posService.quotePricing).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /Settle & Post|Save Partial/i }));
    await waitFor(() => expect(posService.createBill).toHaveBeenCalled());
    expect(posService.createBill.mock.calls[0][0].LineDiscounts).toEqual({});
  });
});

// Sending is manual again, so a round the kitchen never saw must be visible
// before money changes hands — though it must not block a counter-served drink.
describe('Billing — unsent rounds are surfaced, not blocked', () => {
  const item = {
    name: 'Water', costInfoId: CI_DOSA, qty: 1, taxPct: 0,
    netAmount: 20, taxAmount: 0, grossAmount: 20, variantIds: [], taxComponents: [],
  };
  const ORDERS = [
    { Id: 'o1', TableId: 't1', Status: 'open', OrderNo: 'ORD-1', SubTotal: 20, TaxAmount: 0, Total: 20, CreatedOn: '2026-07-01 10:00:00', Items: [item] },
  ];

  const openSettle = async (kots) => {
    posService.getTables.mockResolvedValue([{ Id: 't1', Name: 'T1', Status: 'occupied' }]);
    posService.getOrders.mockResolvedValue(ORDERS);
    posService.getKots.mockResolvedValue(kots);
    posService.createBill.mockResolvedValue({ Id: 'b1' });
    posService.settleBill.mockResolvedValue({});
    await renderBilling({ table: 'T1' });
    fireEvent.click(screen.getByRole('button', { name: /Settle Bill/i }));
    await screen.findByText('Amount Payable');
  };

  test('warns about a round that was never sent', async () => {
    await openSettle([]);
    expect(screen.getByText(/never sent to the kitchen/i)).toBeInTheDocument();
  });

  test('still allows settling it — not every item needs a ticket', async () => {
    await openSettle([]);
    expect(screen.getByRole('button', { name: /Settle & Post|Save Partial/i })).toBeEnabled();
  });

  test('says nothing when every round is in the kitchen', async () => {
    await openSettle([{ OrderId: 'o1', Status: 'pending' }]);
    expect(screen.queryByText(/never sent to the kitchen/i)).not.toBeInTheDocument();
  });
});

describe('Billing — table transfer', () => {
  const item = {
    name: 'Paneer', costInfoId: CI_DOSA, qty: 1, taxPct: 18,
    netAmount: 100, taxAmount: 18, grossAmount: 118, variantIds: [], taxComponents: [],
  };
  const ORDERS = [
    { Id: 'o1', TableId: 't1', Status: 'open', OrderNo: 'ORD-1', SubTotal: 100, TaxAmount: 18, Total: 118, CreatedOn: '2026-07-01 10:00:00', Items: [item] },
  ];

  const openTransfer = async () => {
    posService.getTables.mockResolvedValue([
      { Id: 't1', Name: 'T1', FloorId: 'ground', Status: 'occupied' },
      { Id: 't2', Name: 'R4', FloorId: 'rooftop', Status: 'free' },
    ]);
    posService.getFloors.mockResolvedValue([
      { Id: 'ground', Name: 'Ground' }, { Id: 'rooftop', Name: 'Rooftop' },
    ]);
    posService.getOrders.mockResolvedValue(ORDERS);
    // The floor plan groups by floor, so the card itself reads just "T1".
    await renderBilling({ table: 'T1' });
    fireEvent.click(await screen.findByRole('button', { name: /Transfer table/i }));
    await screen.findByRole('dialog', { name: /Transfer order to another table/i });
  };

  test('Transfer opens the sheet showing the source table', async () => {
    await openTransfer();
    expect(screen.getByText('From')).toBeInTheDocument();
    expect(screen.getByText(/To \(free tables\)/)).toBeInTheDocument();
  });

  test('transfers the complete order to a free table and offers an Undo', async () => {
    posService.transferOrder.mockResolvedValue({ undo: { scope: 'orders', orderIds: ['o1'], toTableId: 't1' } });
    await openTransfer();

    // Round 1 is the default pick; choose the free destination and move.
    fireEvent.click(screen.getByText('— Destination table —'));
    fireEvent.click(screen.getByText('Rooftop - R4'));
    fireEvent.click(screen.getByRole('button', { name: /Move to Rooftop - R4/ }));

    await waitFor(() => expect(posService.transferOrder).toHaveBeenCalledWith({
      scope: 'orders', orderIds: ['o1'], toTableId: 't2',
    }));
  });
});

describe('Billing — send KOT & delete round', () => {
  const baseOrder = {
    Id: 'o1', TableId: 't1', OrderNo: 'ORD-1', SubTotal: 100, TaxAmount: 18, Total: 118,
    CreatedOn: '2026-07-01 10:00:00', Items: [{ name: 'Paneer', qty: 1, grossAmount: 118 }],
  };

  const setup = async (status, kots = []) => {
    posService.getTables.mockResolvedValue([{ Id: 't1', Name: 'T1', Status: 'occupied' }]);
    posService.getOrders.mockResolvedValue([{ ...baseOrder, Status: status }]);
    posService.getKots.mockResolvedValue(kots);
    posService.deleteOrder.mockResolvedValue({});
    await renderBilling({ table: 'T1' });
    await screen.findByText(/Active Order Round/i);
  };

  // Sending is a deliberate act and the server is send-once, so the button stays
  // enabled on a round already in the kitchen — pressing it reports that rather
  // than putting the same food on the pass twice.
  test('reports a round that is already in the kitchen', async () => {
    await setup('fired', [{ OrderId: 'o1', Status: 'pending' }]);
    const btn = screen.getByRole('button', { name: /^Sent/i });
    expect(btn).toBeEnabled();
  });

  test('offers to send a round that has no ticket yet', async () => {
    await setup('open');
    expect(screen.getByRole('button', { name: /^Send KOT$/ })).toBeEnabled();
  });

  test('a fired round with a PENDING kot can still be deleted', async () => {
    await setup('fired', [{ OrderId: 'o1', Status: 'pending' }]);
    expect(screen.getByText('KOT · pending')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Delete round/i }));
    const dialog = await screen.findByRole('dialog', { name: /Delete round/i });
    expect(within(dialog).getByText(/pulled from the pass/i)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: /Delete round/i }));
    await waitFor(() => expect(posService.deleteOrder).toHaveBeenCalledWith('o1'));
  });

  test('once the kitchen has started (kot ready) the round cannot be deleted', async () => {
    await setup('fired', [{ OrderId: 'o1', Status: 'ready' }]);
    expect(screen.getByText('KOT · ready')).toBeInTheDocument();
    // No delete button — an "In kitchen" marker replaces it.
    expect(screen.queryByRole('button', { name: /Delete round/i })).not.toBeInTheDocument();
    expect(screen.getByText('In kitchen')).toBeInTheDocument();
  });
});

describe('Billing — order snapshot', () => {
  test('order items carry the priced snapshot from the quote', async () => {
    posService.getTables.mockResolvedValue([
      { Id: 't1', Name: 'T1', Status: 'free' },
    ]);
    posService.createOrder.mockResolvedValue({ Id: 'o1' });

    await renderBilling({ table: 'T1' });
    addDosaToCart();
    await waitFor(() => expect(posService.quotePricing).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /Start Order|Add Round/i }));

    await waitFor(() => expect(posService.createOrder).toHaveBeenCalled());
    const [payload] = posService.createOrder.mock.calls[0];
    const line = payload.Items[0];
    // Snapshot on write — the order records what was actually charged, so a later
    // rate change cannot silently re-price this order.
    expect(line.costInfoId).toBe(CI_DOSA);
    expect(line.netAmount).toBe(100);
    expect(line.taxAmount).toBe(18);
    expect(line.grossAmount).toBe(118);
    expect(line.taxComponents).toHaveLength(2);
  });

  // The server recomputes every total from the priced lines and discards
  // whatever the client sends, so sending them only invited the two to disagree.
  test('does not send totals or a status the server overwrites anyway', async () => {
    posService.getTables.mockResolvedValue([{ Id: 't1', Name: 'T1', Status: 'free' }]);
    posService.createOrder.mockResolvedValue({ Id: 'o1' });

    await renderBilling({ table: 'T1' });
    addDosaToCart();
    await waitFor(() => expect(posService.quotePricing).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /Start Order|Add Round/i }));

    await waitFor(() => expect(posService.createOrder).toHaveBeenCalled());
    const [payload] = posService.createOrder.mock.calls[0];
    expect(payload.SubTotal).toBeUndefined();
    expect(payload.TaxAmount).toBeUndefined();
    expect(payload.Total).toBeUndefined();
    expect(payload.Status).toBeUndefined();
  });

  // OrderNo was minted from the last 6 digits of Date.now(), which wraps every
  // ~16m40s and then collides with UNIQUE (OrderNo, TenantId) — the round just
  // failed with a duplicate-key error. It is issued by the server now.
  test('does not mint an OrderNo in the browser', async () => {
    posService.getTables.mockResolvedValue([{ Id: 't1', Name: 'T1', Status: 'free' }]);
    posService.createOrder.mockResolvedValue({ Id: 'o1' });

    await renderBilling({ table: 'T1' });
    addDosaToCart();
    await waitFor(() => expect(posService.quotePricing).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /Start Order|Add Round/i }));

    await waitFor(() => expect(posService.createOrder).toHaveBeenCalled());
    const [payload] = posService.createOrder.mock.calls[0];
    expect(payload.OrderNo).toBeUndefined();
  });
});


describe('Billing — tenders (split payment)', () => {
  const ORDERS = [
    { Id: 'o1', TableId: 't1', Status: 'open', SubTotal: 100, TaxAmount: 18, Total: 118, CreatedOn: '2026-07-01 10:00:00', Items: [] },
  ];

  const openSettle = async () => {
    posService.getTables.mockResolvedValue([{ Id: 't1', Name: 'T1', Status: 'occupied' }]);
    posService.getOrders.mockResolvedValue(ORDERS);
    posService.createBill.mockResolvedValue({ Id: 'b1', Total: 118, TransactionNo: 'INV-0042', BalanceDue: 0 });
    posService.settleBill.mockResolvedValue({ Total: 118, TransactionNo: 'INV-0042', BalanceDue: 0 });
    posService.updateOrder.mockResolvedValue({});
    posService.updateTable.mockResolvedValue({});
    await renderBilling({ table: 'T1' });
    fireEvent.click(screen.getByRole('button', { name: /Settle Bill/i }));
    await screen.findByText(/Payments/i);
  };

  test('seeds one tender for the full payable — one-tap settle', async () => {
    await openSettle();
    const amounts = screen.getAllByLabelText('Amount');
    expect(amounts).toHaveLength(1);
    expect(Number(amounts[0].value)).toBeGreaterThan(0);
  });

  test('adds a second tender row for a split payment', async () => {
    await openSettle();
    fireEvent.click(screen.getByRole('button', { name: /Add payment/i }));
    expect(screen.getAllByLabelText('Amount')).toHaveLength(2);
  });

  test('explains and blocks settle when the tenant has no payment modes', async () => {
    posService.getPaymentModes.mockResolvedValue([]);
    await openSettle();
    expect(screen.getByText(/No payment modes set up/i)).toBeInTheDocument();
    // Add payment is disabled (not a silent dead button) and settle is blocked.
    expect(screen.getByRole('button', { name: /Add payment/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Settle & Post|Save Partial/i })).toBeDisabled();
  });

  test('shows a reference field only for card, not cash', async () => {
    await openSettle();
    expect(screen.queryByLabelText('Reference number')).not.toBeInTheDocument();

    fireEvent.change(screen.getAllByLabelText('Payment mode')[0], { target: { value: MODE_CARD } });
    expect(screen.getByLabelText('Reference number')).toBeInTheDocument();
  });

  test('blocks settling a card payment with no reference, and says why', async () => {
    await openSettle();
    fireEvent.change(screen.getAllByLabelText('Payment mode')[0], { target: { value: MODE_CARD } });

    expect(screen.getByRole('alert')).toHaveTextContent(/reference number/i);
    expect(screen.getByRole('button', { name: /Settle & Post/i })).toBeDisabled();
  });

  test('allows settling once the reference is entered', async () => {
    await openSettle();
    fireEvent.change(screen.getAllByLabelText('Payment mode')[0], { target: { value: MODE_CARD } });
    fireEvent.change(screen.getByLabelText('Reference number'), { target: { value: 'AUTH-1' } });

    expect(screen.getByRole('button', { name: /Settle & Post/i })).toBeEnabled();
  });

  test('warns that a short tender records only a partial payment', async () => {
    await openSettle();
    fireEvent.change(screen.getAllByLabelText('Amount')[0], { target: { value: '50' } });

    expect(screen.getByRole('alert')).toHaveTextContent(/still due/i);
    // Not blocked — partial settlement is legitimate, just labelled honestly.
    expect(screen.getByRole('button', { name: /Save Partial/i })).toBeEnabled();
  });

  test('posts every tender to the settle endpoint', async () => {
    await openSettle();
    fireEvent.change(screen.getAllByLabelText('Amount')[0], { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: /Add payment/i }));
    const amounts = screen.getAllByLabelText('Amount');
    fireEvent.change(amounts[1], { target: { value: '18' } });
    fireEvent.click(screen.getByRole('button', { name: /Settle & Post|Save Partial/i }));

    await waitFor(() => expect(posService.settleBill).toHaveBeenCalled());
    const [, payload] = posService.settleBill.mock.calls[0];
    expect(payload.Tenders).toHaveLength(2);
    expect(payload.Tenders.map((t) => t.amount)).toEqual([100, 18]);
  });

  test('shows the invoice number after posting to the ledger', async () => {
    await openSettle();
    fireEvent.click(screen.getByRole('button', { name: /Settle & Post/i }));
    // The invoice number is the customer-facing artefact, so it headlines.
    expect(await screen.findByText('INV-0042')).toBeInTheDocument();
    expect(screen.getByText(/Posted to ledger/i)).toBeInTheDocument();
  });
});

// An order with no table is not a thing this system can represent, so the menu
// says so up front rather than letting a cart accumulate and failing at the end.
describe('Billing — the menu is gated on a table', () => {
  test('hides the menu and explains what to do first', async () => {
    await renderBilling({ table: null });

    expect(screen.getByText(/Pick a table to start/i)).toBeInTheDocument();
    // Not merely dimmed — the items are gone, so nothing invites a tap.
    expect(screen.queryByText('Masala Dosa')).not.toBeInTheDocument();
  });

  test('does not render the menu panel at all until a table is picked', async () => {
    await renderBilling({ table: null });
    // Not a disabled menu — no menu. Nothing to search, nothing to tap.
    expect(screen.queryByPlaceholderText(/Search menu/i)).not.toBeInTheDocument();
  });

  test('shows the room, so picking is one tap and tells you who is busy', async () => {
    await renderBilling({ table: null });
    const cards = screen.getAllByRole('button').filter((b) => b.classList.contains('fd-tablecard'));
    expect(cards.length).toBeGreaterThan(0);
  });

  test('reveals the menu once a table is chosen', async () => {
    await renderBilling({ table: null });
    selectTable('T-1');

    await waitFor(() => expect(screen.getByText('Masala Dosa')).toBeInTheDocument());
    expect(screen.queryByText(/Pick a table to start/i)).not.toBeInTheDocument();
  });
});

// Selecting an occupied table RESUMES it. The list loaded at mount is one page
// deep and already stale on a busy shift, so the table is re-read on selection.
describe('Billing — resuming an occupied table', () => {
  const dosa = {
    name: 'Masala Dosa', costInfoId: CI_DOSA, qty: 1, taxPct: 18,
    netAmount: 100, taxAmount: 18, grossAmount: 118, variantIds: [], taxComponents: [],
  };
  const EXISTING = [{
    Id: 'o1', TableId: 't1', Status: 'open', OrderNo: 'ORD-0001',
    SubTotal: 100, TaxAmount: 18, Total: 118,
    CreatedOn: '2026-08-12 10:00:00', Items: [dosa],
  }];

  const setup = async () => {
    posService.getTables.mockResolvedValue([{ Id: 't1', Name: 'T1', Status: 'occupied' }]);
    // Empty at mount, populated only by the per-table fetch — proving the screen
    // resumes from the targeted read rather than the mount-time list.
    posService.getOrders.mockImplementation(async (params = {}) =>
      (params.tableId === 't1' ? EXISTING : []));
    await renderBilling();
  };

  test('asks the server for that table specifically', async () => {
    await setup();
    await waitFor(() => {
      const call = posService.getOrders.mock.calls.find(([p]) => p && p.tableId === 't1');
      expect(call).toBeDefined();
      // Only live rounds — a table settled this morning must not read as occupied.
      expect(call[0].openOnly).toBe(true);
    });
  });

  test('shows the running order it fetched', async () => {
    await setup();
    await waitFor(() => expect(screen.getByText(/Resuming a running order/i)).toBeInTheDocument());
    // The round number appears in the picker and the timeline — both are the
    // fetched order, so any occurrence proves it arrived.
    expect(screen.getAllByText(/ORD-0001/).length).toBeGreaterThan(0);
  });

  test('lets the cashier append to it — the next round is numbered after it', async () => {
    await setup();
    await waitFor(() => expect(screen.getByText(/Resuming a running order/i)).toBeInTheDocument());

    addDosaToCart();
    expect(screen.getByRole('button', { name: /Add Round 2/i })).toBeInTheDocument();
  });

  test('keeps the last known order when the refresh fails', async () => {
    // Stale context beats a blank screen at a till.
    posService.getTables.mockResolvedValue([{ Id: 't1', Name: 'T1', Status: 'occupied' }]);
    posService.getOrders.mockImplementation(async (params = {}) => {
      if (params.tableId) throw new Error('network');
      return EXISTING;
    });
    await renderBilling();

    await waitFor(() => expect(screen.getByText(/Resuming a running order/i)).toBeInTheDocument());
  });
});

describe('Billing — the cart belongs to its table', () => {
  test('clears items when switching tables', async () => {
    // Carrying them across would bill the wrong guest.
    posService.getTables.mockResolvedValue([
      { Id: 't1', Name: 'T1', Status: 'free' },
      { Id: 't2', Name: 'T2', Status: 'free' },
    ]);
    await renderBilling({ table: 'T1' });
    addDosaToCart();
    await waitFor(() => expect(screen.getByRole('button', { name: /Start Order/i })).toBeEnabled());

    changeTable();
    selectTable('T2');

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Start Order/i })).toBeDisabled());
  });
});

// The floor plan is the first screen, so it has to answer the questions a
// cashier walks up with — not just list names.
describe('Billing — the floor plan', () => {
  const dosa = {
    name: 'Masala Dosa', costInfoId: CI_DOSA, qty: 2, taxPct: 18,
    netAmount: 200, taxAmount: 36, grossAmount: 236, variantIds: [], taxComponents: [],
  };

  const setup = async () => {
    posService.getTables.mockResolvedValue([
      { Id: 't1', Name: 'G-01', FloorId: 'ground', Status: 'free', Capacity: 4 },
      { Id: 't2', Name: 'G-02', FloorId: 'ground', Status: 'occupied', Capacity: 2 },
      { Id: 't9', Name: 'RF-01', FloorId: 'roof', Status: 'free', Capacity: 6 },
    ]);
    posService.getFloors.mockResolvedValue([
      { Id: 'ground', Name: 'Ground Floor' }, { Id: 'roof', Name: 'Roof Top' },
    ]);
    posService.getOrders.mockResolvedValue([{
      Id: 'o1', TableId: 't2', Status: 'open', OrderNo: 'ORD-0001',
      SubTotal: 200, TaxAmount: 36, Total: 236,
      CreatedOn: '2026-08-12 10:00:00', Items: [dosa],
    }]);
    await renderBilling({ table: null });
  };

  test('groups tables under their floor', async () => {
    await setup();
    expect(screen.getByText('Ground Floor')).toBeInTheDocument();
    expect(screen.getByText('Roof Top')).toBeInTheDocument();
  });

  test('shows a running table’s bill without opening it', async () => {
    // "Which table wants to pay" should be answerable by looking.
    await setup();
    const busy = screen.getAllByRole('button').find((b) => within(b).queryByText('G-02'));
    expect(busy).toHaveTextContent('1 round');
    expect(busy).toHaveTextContent('236.00');
  });

  test('marks free tables as free', async () => {
    await setup();
    const free = screen.getAllByRole('button').find((b) => within(b).queryByText('G-01'));
    expect(free).toHaveTextContent(/free/i);
    expect(free.className).toMatch(/free/);
  });

  test('does not rely on colour alone to convey status', async () => {
    await setup();
    const busy = screen.getAllByRole('button').find((b) => within(b).queryByText('G-02'));
    expect(busy.getAttribute('aria-label')).toMatch(/occupied/i);
  });

  test('picking a table opens the workspace for it', async () => {
    await setup();
    selectTable('RF-01');

    await waitFor(() => expect(screen.getByText('Masala Dosa')).toBeInTheDocument());
    expect(screen.getByText('RF-01')).toBeInTheDocument();
  });

  test('Change table goes back to the plan', async () => {
    await setup();
    selectTable('G-01');
    await waitFor(() => expect(screen.getByText('Masala Dosa')).toBeInTheDocument());

    changeTable();

    await waitFor(() =>
      expect(screen.getByText(/Pick a table to start/i)).toBeInTheDocument());
  });

  test('says so when no tables are configured, instead of showing an empty room', async () => {
    posService.getTables.mockResolvedValue([]);
    posService.getFloors.mockResolvedValue([]);
    render(<Billing />);
    expect(await screen.findByText(/No tables set up yet/i)).toBeInTheDocument();
  });
});
