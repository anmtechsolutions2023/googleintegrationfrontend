import React from 'react';
import { render, screen, within } from '@testing-library/react';
import Receipt from '../Receipt';
import { shows, ALWAYS, IF_PRESENT, NEVER } from '../../../../utils/receiptFields';

// What reaches the paper. The rules asserted here are the ones a checkbox gets
// wrong and the ones that cost money when they are wrong.

const SHOP = {
  name: 'Sarjapura Foods',
  address: '142 Sarjapura Road, Bengaluru',
  gstin: '29AABCS1429B1ZQ',
  fssai: '11223344556677',
};

const SALE = (over = {}) => ({
  TransactionNo: 'INV-0418',
  TransactionDate: '2026-08-27T19:04:00Z',
  CustomerName: 'Aarti K.', CustomerMobile: '98765', CreatedBy: 'priya',
  Lines: [
    { Id: 'l1', ItemName: 'Paneer Tikka', Quantity: 2, UnitPrice: 240, GrossAmount: 480, ReturnedQty: 0 },
    { Id: 'l2', ItemName: 'Butter Naan', Quantity: 3, UnitPrice: 65, GrossAmount: 195, ReturnedQty: 0 },
  ],
  TaxByComponent: [{ name: 'CGST', rate: 9, amount: 85.5 }, { name: 'SGST', rate: 9, amount: 85.5 }],
  NetAmount: 950, TaxAmount: 171, DiscountAmount: 0, RoundOff: 0, GrossAmount: 1121,
  Tenders: [{ Id: 't1', PaymentMode: 'Cash', Amount: 1121 }],
  ReturnedAmount: 0, NetOfReturns: 1121,
  taxMode: 'gst',
  ...over,
});

const FORMAT = (over = {}) => ({
  shopName: ALWAYS, address: ALWAYS, gstin: ALWAYS, fssai: ALWAYS,
  documentNo: ALWAYS, dateTime: 'datetime', cashier: ALWAYS,
  token: IF_PRESENT, table: IF_PRESENT, customer: IF_PRESENT, portalOrder: IF_PRESENT,
  itemLayout: 'two_line', itemCode: NEVER, itemNotes: IF_PRESENT, returnedQty: IF_PRESENT,
  subtotal: ALWAYS, discount: IF_PRESENT, taxRows: 'split', roundOff: IF_PRESENT,
  total: ALWAYS, returnsBlock: IF_PRESENT,
  tenders: ALWAYS, tenderRef: IF_PRESENT, changeDue: IF_PRESENT, balanceDue: IF_PRESENT,
  footerLine1: 'Thank you — please come again', footerLine2: '',
  compositionNote: NEVER, upiQr: NEVER, signature: NEVER,
  paperWidth: '80', copies: '1',
  ...over,
});

const paper = (doc, format, data, shop = SHOP) => {
  render(<Receipt doc={doc} format={format} shop={shop} data={data} inline />);
  return screen.getByTestId(`receipt-${doc}`);
};

// ── The three-state rule ─────────────────────────────────────────────────────
describe('a field that depends on the sale, not on a preference', () => {
  // ALWAYS would print "Customer: —" on every walk-in; NEVER would lose the
  // name for the customers who did give one.
  test('if_present prints it when there is one', () => {
    const el = paper('bill', FORMAT(), SALE());
    expect(within(el).getByText('Customer')).toBeInTheDocument();
    expect(within(el).getByText(/Aarti K\./)).toBeInTheDocument();
  });

  test('if_present prints NOTHING — not a blank row — when there is not', () => {
    const el = paper('bill', FORMAT(), SALE({ CustomerName: null, CustomerMobile: null }));
    expect(within(el).queryByText('Customer')).toBeNull();
  });

  test('always prints it regardless', () => {
    const el = paper('bill', FORMAT({ cashier: ALWAYS }), SALE());
    expect(within(el).getByText('Cashier')).toBeInTheDocument();
  });

  test('never hides it even when the sale has one', () => {
    const el = paper('bill', FORMAT({ customer: NEVER }), SALE());
    expect(within(el).queryByText('Customer')).toBeNull();
  });
});

describe('the fallback when no format could be fetched', () => {
  // A bill must still print when a settings call is down: print what exists,
  // skip what does not.
  test('prints what exists', () => {
    const el = paper('bill', null, SALE());
    expect(within(el).getByText('INV-0418')).toBeInTheDocument();
    expect(within(el).getByText(/Paneer Tikka/)).toBeInTheDocument();
    expect(within(el).getByText('TOTAL')).toBeInTheDocument();
  });

  test('and skips what does not', () => {
    const el = paper('bill', null, SALE({ CustomerName: null, CustomerMobile: null }));
    expect(within(el).queryByText('Customer')).toBeNull();
  });
});

describe('the tax rows', () => {
  test('split prints each component at the rate the sale was raised at', () => {
    const el = paper('bill', FORMAT({ taxRows: 'split' }), SALE());
    expect(within(el).getByText('CGST 9%')).toBeInTheDocument();
    expect(within(el).getByText('SGST 9%')).toBeInTheDocument();
  });

  test('single collapses them to one line', () => {
    const el = paper('bill', FORMAT({ taxRows: 'single' }), SALE());
    expect(within(el).queryByText('CGST 9%')).toBeNull();
    expect(within(el).getByText('Tax')).toBeInTheDocument();
  });

  // The composition / unregistered case, which the server locks here.
  test('none removes them entirely', () => {
    const el = paper('bill', FORMAT({ taxRows: 'none' }), SALE());
    expect(within(el).queryByText('CGST 9%')).toBeNull();
    expect(within(el).queryByText('Tax')).toBeNull();
  });
});

describe('the document title', () => {
  test('a registered branch raises a TAX INVOICE', () => {
    const el = paper('bill', FORMAT(), SALE({ taxMode: 'gst' }));
    expect(within(el).getByText('TAX INVOICE')).toBeInTheDocument();
  });

  // Not a preference — a composition dealer may not call it a tax invoice.
  test.each(['composition', 'unregistered'])('%s raises a BILL OF SUPPLY', (mode) => {
    const el = paper('bill', FORMAT(), SALE({ taxMode: mode }));
    expect(within(el).getByText('BILL OF SUPPLY')).toBeInTheDocument();
    expect(within(el).queryByText('TAX INVOICE')).toBeNull();
  });

  test('a composition dealer carries the mandatory declaration', () => {
    const el = paper('bill', FORMAT({ compositionNote: ALWAYS }), SALE({ taxMode: 'composition' }));
    expect(within(el).getByText(/Composition taxable person/)).toBeInTheDocument();
  });
});

describe('a reprint', () => {
  test('says so — two identical bills is one meal paid for twice', () => {
    const el = paper('bill', FORMAT(), SALE({ isReprint: true }));
    expect(within(el).getByText('** REPRINT **')).toBeInTheDocument();
  });

  // The original total keeps the weight; returned and net ride beneath it —
  // the same rule the Ledger screen follows, so paper and screen agree.
  test('never rewrites the total, and shows what has come back', () => {
    const el = paper('bill', FORMAT(), SALE({
      isReprint: true, ReturnedAmount: 130, NetOfReturns: 991,
      Lines: [{ Id: 'l1', ItemName: 'Butter Naan', Quantity: 3, UnitPrice: 65, GrossAmount: 195, ReturnedQty: 2 }],
    }));

    // Scoped to the TOTAL row: the same figure also appears as the tender,
    // which is exactly right and not what this asserts.
    const total = within(el).getByText('TOTAL').closest('.rc-row');
    expect(within(total).getByText('1121.00')).toBeInTheDocument();  // untouched
    expect(within(el).getByText('-130.00')).toBeInTheDocument();
    const net = within(el).getByText('NET').closest('.rc-row');
    expect(within(net).getByText('991.00')).toBeInTheDocument();
    expect(within(el).getByText(/2 returned/)).toBeInTheDocument();
    // The quantity SOLD is not rewritten.
    expect(within(el).getByText(/3 x 65\.00/)).toBeInTheDocument();
  });
});

describe('a credit note', () => {
  const NOTE = {
    TransactionNo: 'CN-0034', CreatedOn: '2026-08-27T19:41:00Z',
    OriginalNo: 'INV-0418', ReasonName: 'Quality complaint', CreatedBy: 'priya',
    Lines: [{ Id: 'l1', ItemName: 'Butter Naan', Quantity: 2, UnitPrice: 65, GrossAmount: 130 }],
    TaxByComponent: [{ name: 'CGST', rate: 9, amount: 9.92 }],
    NetAmount: 110.17, TaxAmount: 19.83, GrossAmount: 130,
    Tenders: [{ Id: 't', PaymentMode: 'Cash', Amount: -130 }],
  };
  const NOTE_FORMAT = {
    shopName: ALWAYS, address: ALWAYS, gstin: ALWAYS,
    documentNo: ALWAYS, originalNo: ALWAYS, dateTime: 'datetime',
    reason: ALWAYS, cashier: ALWAYS, customer: IF_PRESENT,
    taxRows: 'split', total: ALWAYS, refundedTo: ALWAYS,
    signature: ALWAYS, footerLine1: 'Retain this note.', compositionNote: NEVER,
    paperWidth: '80', copies: '1',
  };

  // The one mistake that matters: a credit note mistaken for a bill is a refund
  // banked as a sale.
  test('is titled CREDIT NOTE, never TAX INVOICE', () => {
    const el = paper('creditNote', NOTE_FORMAT, NOTE);
    expect(within(el).getByText('CREDIT NOTE')).toBeInTheDocument();
    expect(within(el).queryByText('TAX INVOICE')).toBeNull();
  });

  test('names the sale it came off — it is meaningless without one', () => {
    const el = paper('creditNote', NOTE_FORMAT, NOTE);
    expect(within(el).getByText('Against')).toBeInTheDocument();
    expect(within(el).getByText('INV-0418')).toBeInTheDocument();
  });

  test('says REFUNDED rather than TOTAL, and where the money went', () => {
    const el = paper('creditNote', NOTE_FORMAT, NOTE);
    expect(within(el).getByText('REFUNDED')).toBeInTheDocument();
    expect(within(el).getByText('Refunded to')).toBeInTheDocument();
    // The amount is shown positive; the direction is the document type.
    expect(within(el).getAllByText('130.00').length).toBeGreaterThan(0);
  });
});

describe('a kitchen ticket', () => {
  const KOT = {
    KotNo: 'KOT-0231', CreatedOn: '2026-08-27T19:04:00Z',
    tableName: 'TABLE 7', round: 2, waiter: 'ravi',
    Lines: [
      { Id: 'a', ItemName: 'Paneer Tikka', Quantity: 2, Note: 'Jain no onion', GrossAmount: 480 },
    ],
  };
  const KOT_FORMAT = {
    documentNo: ALWAYS, table: IF_PRESENT, token: IF_PRESENT, round: ALWAYS,
    waiter: ALWAYS, dateTime: 'time',
    prices: NEVER, bigQty: ALWAYS, itemNotes: ALWAYS, foodTypeMark: NEVER,
    paperWidth: '80', copies: '1',
  };

  // A cook does not price the dish. Every character that is not the dish or the
  // quantity is noise on a ticket read at arm's length.
  test('carries no prices by default', () => {
    const el = paper('kot', KOT_FORMAT, KOT);
    expect(within(el).queryByText('480.00')).toBeNull();
  });

  test('and no shop name or GSTIN', () => {
    const el = paper('kot', KOT_FORMAT, KOT);
    expect(within(el).queryByText(/SARJAPURA FOODS/)).toBeNull();
    expect(within(el).queryByText(/GSTIN/)).toBeNull();
  });

  // The single most important line on the ticket.
  test('shouts the modifiers', () => {
    const el = paper('kot', KOT_FORMAT, KOT);
    expect(within(el).getByText(/JAIN NO ONION/)).toBeInTheDocument();
  });

  test('can be given prices when a kitchen genuinely wants them', () => {
    const el = paper('kot', { ...KOT_FORMAT, prices: ALWAYS }, KOT);
    expect(within(el).getByText('480.00')).toBeInTheDocument();
  });
});

describe('copies', () => {
  // The renderer spends the paper, so it is the renderer that has to be honest
  // about how much. One block per copy, with a page break between, so the
  // cutter fires between them rather than producing one long strip.
  const papers = (format) => {
    render(<Receipt doc="bill" format={format} shop={SHOP} data={SALE()} />);
    return document.querySelectorAll('.rc-paper');
  };

  test('one copy renders one', () => {
    expect(papers(FORMAT({ copies: '1' }))).toHaveLength(1);
  });

  test('two copies render two', () => {
    expect(papers(FORMAT({ copies: '2' }))).toHaveLength(2);
  });

  // A missing or unreadable setting must never multiply paper.
  test.each([undefined, '', 'lots'])('%p falls back to one', (copies) => {
    expect(papers(FORMAT({ copies }))).toHaveLength(1);
  });
});

describe('paper width', () => {
  test.each([['80', 'rc-w80'], ['58', 'rc-w58']])('%smm sets its own class', (width, cls) => {
    const el = paper('bill', FORMAT({ paperWidth: width }), SALE());
    expect(el).toHaveClass(cls);
  });
});

describe('shows()', () => {
  test.each([
    [ALWAYS, '', true],
    [ALWAYS, 'x', true],
    [NEVER, 'x', false],
    [IF_PRESENT, 'x', true],
    [IF_PRESENT, '', false],
    [IF_PRESENT, '   ', false],
    [IF_PRESENT, 0, false],
    [IF_PRESENT, [], false],
    [IF_PRESENT, ['a'], true],
  ])('%s with %p → %p', (state, value, expected) => {
    expect(shows({ f: state }, 'f', value)).toBe(expected);
  });

  test('an unknown field falls back to "print it if there is something"', () => {
    expect(shows({}, 'nope', 'x')).toBe(true);
    expect(shows({}, 'nope', '')).toBe(false);
  });
});
