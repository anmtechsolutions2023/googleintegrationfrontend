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

const renderBilling = async () => {
  render(<Billing />);
  await screen.findByText('Masala Dosa');
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

// TableSelect is a custom listbox button, not a native <select>.
const selectTable = (label) => {
  fireEvent.click(screen.getByRole('button', { name: /Select table|Table/i }));
  fireEvent.click(screen.getByText(label));
};

beforeEach(() => {
  posService.getTables.mockResolvedValue([]);
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
    render(<Billing />);
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
    render(<Billing />);
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
    { Id: 'o1', TableId: 't1', Status: 'Active', SubTotal: 100, TaxAmount: 18, Total: 118, CreatedOn: '2026-07-01 10:00:00', Items: [] },
    { Id: 'o2', TableId: 't1', Status: 'Active', SubTotal: 50, TaxAmount: 9, Total: 59, CreatedOn: '2026-07-01 10:30:00', Items: [] },
  ];

  const openSettle = async () => {
    posService.getTables.mockResolvedValue([
      { Id: 't1', Name: 'T1', Status: 'Occupied' },
    ]);
    posService.getOrders.mockResolvedValue(ORDERS);
    posService.createBill.mockResolvedValue({ Id: 'b1', Total: 141.6 });
    posService.settleBill.mockResolvedValue({});
    posService.updateOrder.mockResolvedValue({});
    posService.updateTable.mockResolvedValue({});

    await renderBilling();
    selectTable('T1');
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
    fireEvent.change(screen.getByLabelText(/Discount/i), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: /Settle & Post|Save Partial/i }));

    await waitFor(() => expect(posService.settleBill).toHaveBeenCalled());
    const [, settlePayload] = posService.settleBill.mock.calls[0];
    // One tender row per payment — this is what becomes a paymentbreakup.
    expect(settlePayload.Tenders).toHaveLength(1);
    // 141.60 is discount-before-tax; the old flow would have paid 147.
    expect(settlePayload.Tenders[0].amount).toBe(141.6);
    expect(settlePayload.Tenders[0].paymentModeId).toBe(MODE_CASH);
    expect(settlePayload.Discount).toBe(30);
  });

  test('tells the user the discount is applied before tax', async () => {
    await openSettle();
    expect(screen.getByText(/reduces the taxable amount/i)).toBeInTheDocument();
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
    { Id: 'o1', TableId: 't1', Status: 'Active', OrderNo: 'ORD-748310', SubTotal: 100, TaxAmount: 18, Total: 118, CreatedOn: '2026-07-01 10:00:00', Items: [dosaItem] },
    { Id: 'o2', TableId: 't1', Status: 'Active', OrderNo: 'ORD-755831', SubTotal: 20, TaxAmount: 0, Total: 20, CreatedOn: '2026-07-01 10:30:00', Items: [waterItem] },
  ];

  const openSession = async () => {
    posService.getTables.mockResolvedValue([{ Id: 't1', Name: 'T1', Status: 'Occupied' }]);
    posService.getOrders.mockResolvedValue(ROUNDS);
    await renderBilling();
    selectTable('T1');
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
    { Id: 'o1', TableId: 't1', Status: 'Active', OrderNo: 'ORD-1', SubTotal: 100, TaxAmount: 18, Total: 118, CreatedOn: '2026-07-01 10:00:00', Items: [dosaItem] },
  ];

  const openSettle = async () => {
    posService.getTables.mockResolvedValue([{ Id: 't1', Name: 'T1', Status: 'Occupied' }]);
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
    await renderBilling();
    selectTable('T1');
    fireEvent.click(screen.getByRole('button', { name: /Settle Bill/i }));
    await screen.findByText('Amount Payable');
  };

  test('shows the payable and reprices it live as the discount changes', async () => {
    await openSettle();
    // No discount → payable is the full 118.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Settle & Post ₹118\.00/ })).toBeInTheDocument()
    );

    // ₹20 off, before tax: (100−20) + 18% = 94.40.
    fireEvent.change(screen.getByLabelText(/Discount/i), { target: { value: '20' } });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Settle & Post ₹94\.40/ })).toBeInTheDocument()
    );
    expect(screen.getByText('−₹20.00')).toBeInTheDocument();
  });

  test('supports a percentage discount and quotes it as a percent', async () => {
    await openSettle();
    // Switch to % mode, then 10% off (net 100 → 90, +18% = 106.20).
    fireEvent.click(screen.getByRole('button', { name: '%', exact: true }));
    fireEvent.change(screen.getByLabelText(/Discount/i), { target: { value: '10' } });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Settle & Post ₹106\.20/ })).toBeInTheDocument()
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
    fireEvent.change(screen.getByLabelText(/Discount/i), { target: { value: '10' } });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Settle & Post ₹106\.20/ })).toBeInTheDocument()
    );

    fireEvent.click(screen.getByRole('button', { name: /Settle & Post|Save Partial/i }));
    await waitFor(() => expect(posService.createBill).toHaveBeenCalled());
    const [payload] = posService.createBill.mock.calls[0];
    // 10% of the 100 subtotal = ₹10 sent as a flat amount the bill understands.
    expect(payload.Discount).toBe(10);
  });
});

describe('Billing — table transfer', () => {
  const item = {
    name: 'Paneer', costInfoId: CI_DOSA, qty: 1, taxPct: 18,
    netAmount: 100, taxAmount: 18, grossAmount: 118, variantIds: [], taxComponents: [],
  };
  const ORDERS = [
    { Id: 'o1', TableId: 't1', Status: 'Active', OrderNo: 'ORD-1', SubTotal: 100, TaxAmount: 18, Total: 118, CreatedOn: '2026-07-01 10:00:00', Items: [item] },
  ];

  const openTransfer = async () => {
    posService.getTables.mockResolvedValue([
      { Id: 't1', Name: 'T1', FloorId: 'ground', Status: 'Occupied' },
      { Id: 't2', Name: 'R4', FloorId: 'rooftop', Status: 'Available' },
    ]);
    posService.getFloors.mockResolvedValue([
      { Id: 'ground', Name: 'Ground' }, { Id: 'rooftop', Name: 'Rooftop' },
    ]);
    posService.getOrders.mockResolvedValue(ORDERS);
    await renderBilling();
    // Floors are set here, so the table label is "Ground - T1".
    selectTable('Ground - T1');
    fireEvent.click(await screen.findByRole('button', { name: /^Transfer$/ }));
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

describe('Billing — fire once & delete round', () => {
  const baseOrder = {
    Id: 'o1', TableId: 't1', OrderNo: 'ORD-1', SubTotal: 100, TaxAmount: 18, Total: 118,
    CreatedOn: '2026-07-01 10:00:00', Items: [{ name: 'Paneer', qty: 1, grossAmount: 118 }],
  };

  const setup = async (status, kots = []) => {
    posService.getTables.mockResolvedValue([{ Id: 't1', Name: 'T1', Status: 'Occupied' }]);
    posService.getOrders.mockResolvedValue([{ ...baseOrder, Status: status }]);
    posService.getKots.mockResolvedValue(kots);
    posService.deleteOrder.mockResolvedValue({});
    await renderBilling();
    selectTable('T1');
    await screen.findByText(/Active Order Round/i);
  };

  test('Fire KOT is disabled and relabelled once the round has fired', async () => {
    await setup('fired');
    expect(screen.getByRole('button', { name: /KOT Fired/i })).toBeDisabled();
  });

  test('Fire KOT is available while the round is still open', async () => {
    await setup('Active');
    expect(screen.getByRole('button', { name: /^Fire KOT$/ })).toBeEnabled();
  });

  test('a fired round with a PENDING kot can still be deleted', async () => {
    await setup('fired', [{ OrderId: 'o1', Status: 'pending' }]);
    expect(screen.getByText('KOT · pending')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Delete round/i }));
    const dialog = await screen.findByRole('dialog', { name: /Delete round/i });
    expect(within(dialog).getByText(/pulled from the kitchen/i)).toBeInTheDocument();
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
      { Id: 't1', Name: 'T1', Status: 'Available' },
    ]);
    posService.createOrder.mockResolvedValue({ Id: 'o1' });

    await renderBilling();
    selectTable('T1');
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
    expect(payload.TaxAmount).toBe(18);
    expect(payload.Total).toBe(118);
  });
});


describe('Billing — tenders (split payment)', () => {
  const ORDERS = [
    { Id: 'o1', TableId: 't1', Status: 'Active', SubTotal: 100, TaxAmount: 18, Total: 118, CreatedOn: '2026-07-01 10:00:00', Items: [] },
  ];

  const openSettle = async () => {
    posService.getTables.mockResolvedValue([{ Id: 't1', Name: 'T1', Status: 'Occupied' }]);
    posService.getOrders.mockResolvedValue(ORDERS);
    posService.createBill.mockResolvedValue({ Id: 'b1', Total: 118, TransactionNo: 'INV-0042', BalanceDue: 0 });
    posService.settleBill.mockResolvedValue({ Total: 118, TransactionNo: 'INV-0042', BalanceDue: 0 });
    posService.updateOrder.mockResolvedValue({});
    posService.updateTable.mockResolvedValue({});
    await renderBilling();
    selectTable('T1');
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
