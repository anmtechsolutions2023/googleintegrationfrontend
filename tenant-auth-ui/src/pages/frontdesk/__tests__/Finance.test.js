import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import Finance from '../Finance';
import posService from '../../../services/posService';
import crudService from '../../../services/crudService';

jest.mock('../../../services/posService', () => ({
  __esModule: true,
  default: {
    getPosBranches: jest.fn(),
    getFinanceOverview: jest.fn(),
    getSalesReport: jest.fn(),
    getProductReport: jest.fn(),
    getPendingReport: jest.fn(),
    getTenderReport: jest.fn(),
    getCashFlowReport: jest.fn(),
    getExpenseReport: jest.fn(),
    getVenueReport: jest.fn(),
    getChannelReport: jest.fn(),
    getDiscountReport: jest.fn(),
    getCustomerReport: jest.fn(),
    getVisitPatternReport: jest.fn(),
    getLapsedReport: jest.fn(),
    // Filter options for the timeframe picker.
    getFloors: jest.fn(),
    getTables: jest.fn(),
  },
}));
jest.mock('../../../services/crudService', () => ({
  __esModule: true,
  default: { getAll: jest.fn() },
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const RANGE = { from: '2026-08-02', to: '2026-08-02', bucket: 'day', weekendOnly: false };

const OVERVIEW = {
  range: RANGE,
  sales: { GrossAmount: 266, Collected: 266, Outstanding: 0, DiscountAmount: 25 },
  salesTrend: [{ Bucket: '2026-08-02', Documents: 1, GrossAmount: 266, DiscountAmount: 25, TaxAmount: 40.5 }],
  expenses: { total: 80, categories: [{ ExpenseCategoryId: 'c1', CategoryName: 'Gas', Entries: 1, Amount: 80 }] },
  cash: { Inflow: 266, Outflow: 80, NetMovement: 186 },
  accounts: [{ AccountTypeBaseId: 'a1', AccountName: 'Cash', AccountKind: 'ASSET', Inflow: 200, Outflow: 80, NetMovement: 120 }],
  netPosition: 186,
};

const SALES = {
  range: RANGE,
  summary: {
    Documents: 2, NetAmount: 225, TaxAmount: 40.5, DiscountAmount: 25,
    RoundOff: 0.5, GrossAmount: 266, Collected: 226, Outstanding: 40,
  },
  trend: [{ Bucket: '2026-08-02', Documents: 2, GrossAmount: 266, DiscountAmount: 25, TaxAmount: 40.5 }],
};

const PRODUCTS = {
  range: RANGE,
  products: [
    { ItemId: 'i1', ItemName: 'Masala Dosa', CategoryName: 'South', QuantitySold: 2, NetAmount: 180, DiscountAmount: 20, TaxAmount: 32.4, GrossAmount: 212.4, Documents: 1 },
    { ItemId: 'i2', ItemName: 'Filter Coffee', CategoryName: null, QuantitySold: 1, NetAmount: 45, DiscountAmount: 5, TaxAmount: 8.1, GrossAmount: 53.1, Documents: 1 },
  ],
};

const PENDING = {
  range: RANGE,
  unpaid: {
    documents: [{ Id: 'l1', TransactionNo: 'INV-0002', TransactionDate: '2026-08-02', CustomerName: null, GrossAmount: 100, Collected: 60, Outstanding: 40 }],
    totalOutstanding: 40,
  },
  unbilled: { orders: [{ Id: 'o1', OrderNo: 'ORD-9', OrderType: 'dinein', Status: 'open', Total: 250, CreatedOn: '2026-08-02T10:00:00Z' }], totalValue: 250 },
};

const TENDERS = {
  range: RANGE,
  tenders: [
    { PaymentModeId: 'm1', PaymentMode: 'Cash', AccountName: 'Cash', AccountKind: 'ASSET', Tenders: 3, Inflow: 200, Outflow: 80, NetAmount: 120 },
    { PaymentModeId: 'm2', PaymentMode: 'Card', AccountName: 'Bank', AccountKind: 'ASSET', Tenders: 1, Inflow: 66, Outflow: 0, NetAmount: 66 },
  ],
};

const CASHFLOW = {
  range: RANGE,
  accounts: [{ AccountTypeBaseId: 'a1', AccountName: 'Cash', AccountKind: 'ASSET', Inflow: 200, Outflow: 80, NetMovement: 120 }],
  totals: { Inflow: 266, Outflow: 80, NetMovement: 186 },
};

const EXPENSES = {
  range: RANGE,
  categories: [{ ExpenseCategoryId: 'c1', CategoryName: 'Gas', Entries: 2, Amount: 80 }],
  trend: [{ Bucket: '2026-08-02', Entries: 2, Amount: 80 }],
  totalAmount: 80,
};

const VENUE = {
  range: RANGE,
  floors: [
    { FloorId: 'f1', FloorName: 'Ground', Tables: 2, Seats: 6, Orders: 4, Bills: 3, NetAmount: 300, DiscountAmount: 0, TaxAmount: 54, GrossAmount: 354, AvgBillValue: 118, RevenuePerSeat: 59 },
    { FloorId: 'f2', FloorName: 'Rooftop', Tables: 1, Seats: 6, Orders: 2, Bills: 1, NetAmount: 500, DiscountAmount: 50, TaxAmount: 90, GrossAmount: 590, AvgBillValue: 590, RevenuePerSeat: 98.33 },
  ],
  tables: [
    { FloorId: 'f1', FloorName: 'Ground', TableId: 't1', TableName: 'T1', Capacity: 4, Orders: 3, Bills: 2, NetAmount: 200, DiscountAmount: 0, TaxAmount: 36, GrossAmount: 236, AvgBillValue: 118, RevenuePerSeat: 59 },
    { FloorId: 'f2', FloorName: 'Rooftop', TableId: 't9', TableName: 'R1', Capacity: null, Orders: 2, Bills: 1, NetAmount: 500, DiscountAmount: 50, TaxAmount: 90, GrossAmount: 590, AvgBillValue: 590, RevenuePerSeat: null },
  ],
  totalGross: 944,
};

const DISCOUNTS = {
  range: RANGE,
  summary: { Documents: 4, DiscountAmount: 120, ItemDiscountAmount: 70, BillDiscountAmount: 50, GrossAmount: 2000 },
  products: [
    { ItemId: 'i1', ItemName: 'Masala Dosa', QuantitySold: 5, DiscountAmount: 80, ItemDiscountAmount: 60, BillDiscountAmount: 20, GrossAmount: 900, Documents: 3 },
  ],
  bills: [
    { Id: 'log-1', TransactionNo: 'INV-0001', TransactionDate: '2026-08-02', CustomerName: null, GrossAmount: 1000, DiscountAmount: 120, ItemDiscountAmount: 70, BillDiscountAmount: 50 },
  ],
};

// Revenue by where the sale happened, with the counter queue beside it. The
// two halves come from different sources — ledger and pos_token — and the
// service composes them.
const CHANNELS = {
  range: RANGE,
  channels: [
    { Channel: 'Dine-in',  Orders: 6, Bills: 4, NetAmount: 800, DiscountAmount: 20, TaxAmount: 144, GrossAmount: 944, AvgBillValue: 236, ShareOfRevenue: 57.15 },
    { Channel: 'Counter',  Orders: 9, Bills: 9, NetAmount: 400, DiscountAmount: 0,  TaxAmount: 72,  GrossAmount: 472, AvgBillValue: 52.44, ShareOfRevenue: 28.57 },
    { Channel: 'Delivery', Orders: 2, Bills: 2, NetAmount: 200, DiscountAmount: 0,  TaxAmount: 36,  GrossAmount: 236, AvgBillValue: 118, ShareOfRevenue: 14.28 },
  ],
  totalGross: 1652,
  queue: {
    range: RANGE,
    summary: {
      Issued: 12, Served: 10, Waiting: 1, Called: 1, Cancelled: 0,
      AvgWaitMinutes: 4.5, MaxWaitMinutes: 15, AvgCollectMinutes: 0.8,
    },
    trend: [{ Bucket: '2026-08-02', Issued: 12, Served: 10, AvgWaitMinutes: 4.5 }],
  },
};

const CUSTOMERS = {
  range: RANGE,
  summary: {
    Documents: 10, KnownCustomers: 2, RepeatCustomers: 1,
    KnownOrders: 5, KnownSpend: 4250, IdentifiedRate: 50, RepeatRate: 50,
  },
  customers: [
    { Id: 'c1', Name: 'Priya R', Phone: '9876543210', Orders: 4, Spend: 4000,
      AverageOrder: 1000, FirstVisit: '2026-08-01', LastOrder: '2026-08-20',
      DaysSinceLast: 6, AvgDaysBetween: 6.3, IsRepeat: true, LoyaltyPoints: 20 },
    { Id: 'c2', Name: 'Arjun', Phone: null, Orders: 1, Spend: 250,
      AverageOrder: 250, FirstVisit: '2026-08-10', LastOrder: '2026-08-10',
      DaysSinceLast: 16, AvgDaysBetween: null, IsRepeat: false, LoyaltyPoints: 2 },
  ],
};

const LAPSED = {
  thresholdDays: 30,
  customers: [
    { Id: 'c9', Name: 'Meera', Phone: '90000', Visits: 8, TotalSpent: 9000,
      LoyaltyPoints: 40, LastVisitAt: '2026-05-01', DaysSince: 117 },
  ],
};

const VISITS = {
  range: RANGE,
  cells: [
    { Dow: 4, Day: 'Wednesday', Hour: 13, Visits: 2, Spend: 400 },
    { Dow: 4, Day: 'Wednesday', Hour: 20, Visits: 7, Spend: 2100 },
    { Dow: 6, Day: 'Friday', Hour: 20, Visits: 5, Spend: 1500 },
  ],
  byDay: [
    { Dow: 1, Day: 'Sunday', Visits: 0, Spend: 0 },
    { Dow: 2, Day: 'Monday', Visits: 0, Spend: 0 },
    { Dow: 3, Day: 'Tuesday', Visits: 0, Spend: 0 },
    { Dow: 4, Day: 'Wednesday', Visits: 9, Spend: 2500 },
    { Dow: 5, Day: 'Thursday', Visits: 0, Spend: 0 },
    { Dow: 6, Day: 'Friday', Visits: 5, Spend: 1500 },
    { Dow: 7, Day: 'Saturday', Visits: 0, Spend: 0 },
  ],
  byHour: Array.from({ length: 24 }, (_, h) => ({
    Hour: h,
    Visits: h === 13 ? 2 : h === 20 ? 12 : 0,
    Spend: h === 13 ? 400 : h === 20 ? 3600 : 0,
  })),
  Busiest: { Day: 'Wednesday', Hour: 20, Visits: 7 },
};

beforeEach(() => {
  posService.getFinanceOverview.mockResolvedValue(OVERVIEW);
  posService.getCustomerReport.mockResolvedValue(CUSTOMERS);
  posService.getVisitPatternReport.mockResolvedValue(VISITS);
  posService.getLapsedReport.mockResolvedValue(LAPSED);
  posService.getSalesReport.mockResolvedValue(SALES);
  posService.getProductReport.mockResolvedValue(PRODUCTS);
  posService.getPendingReport.mockResolvedValue(PENDING);
  posService.getTenderReport.mockResolvedValue(TENDERS);
  posService.getCashFlowReport.mockResolvedValue(CASHFLOW);
  posService.getExpenseReport.mockResolvedValue(EXPENSES);
  posService.getVenueReport.mockResolvedValue(VENUE);
  posService.getChannelReport.mockResolvedValue(CHANNELS);
  posService.getDiscountReport.mockResolvedValue(DISCOUNTS);
  posService.getFloors.mockResolvedValue([
    { Id: 'f1', Name: 'Ground' },
    { Id: 'f2', Name: 'Rooftop' },
  ]);
  posService.getTables.mockResolvedValue([
    { Id: 't1', Name: 'T1', FloorId: 'f1' },
    { Id: 't9', Name: 'R1', FloorId: 'f2' },
  ]);
  posService.getPosBranches.mockResolvedValue([{ Id: 'b1', BranchName: 'Koramangala' }]);
});

afterEach(() => jest.clearAllMocks());

const renderFinance = async () => {
  render(<Finance />);
  await screen.findByText(/Net position/i);
};

const goToTab = async (name) => {
  fireEvent.click(screen.getByRole('tab', { name: new RegExp(name, 'i') }));
  await waitFor(() => expect(screen.queryByText('Loading report…')).not.toBeInTheDocument());
};

/** Reads a KPI card's value by its label — figures repeat across cards. */
const kpiValue = (label) =>
  screen.getByText(label).closest('.fd-kpi-card').querySelector('.kpi-value').textContent;

/** The <tr> whose first cell is `first` — rows share cell values legitimately. */
const rowStartingWith = (first) =>
  screen.getAllByRole('row').find((r) => r.querySelector('td')?.textContent === first);

describe('timeframe — one control, mirroring the server resolver', () => {
  test('offers every preset the backend accepts', async () => {
    await renderFinance();
    const labels = [
      'Today', 'Yesterday', 'Last 3 days', 'Last 5 days',
      'This week', 'Weekends only', 'This month', 'Custom range',
    ];
    labels.forEach((label) => {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    });
  });

  test('sends the chosen preset to the API', async () => {
    await renderFinance();
    fireEvent.click(screen.getByRole('button', { name: 'Last 5 days' }));
    await waitFor(() =>
      expect(posService.getFinanceOverview).toHaveBeenLastCalledWith(
        expect.objectContaining({ preset: 'last5' }),
      ));
  });

  test('weekend is the same window plus a flag, not a separate report', async () => {
    await renderFinance();
    fireEvent.click(screen.getByRole('button', { name: 'Weekends only' }));
    await waitFor(() =>
      expect(posService.getFinanceOverview).toHaveBeenLastCalledWith(
        expect.objectContaining({ preset: 'weekend' }),
      ));
  });

  test('does not fire a request for a custom range with no dates', async () => {
    await renderFinance();
    posService.getFinanceOverview.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Custom range' }));
    await screen.findByText(/Pick a start and end date/i);
    expect(posService.getFinanceOverview).not.toHaveBeenCalled();
  });

  test('passes the bucket through so trends group as asked', async () => {
    await renderFinance();
    fireEvent.change(screen.getByLabelText('Group by'), { target: { value: 'month' } });
    await waitFor(() =>
      expect(posService.getFinanceOverview).toHaveBeenLastCalledWith(
        expect.objectContaining({ bucket: 'month' }),
      ));
  });

  test('filters by branch when one is picked', async () => {
    await renderFinance();
    await screen.findByText('Koramangala');
    fireEvent.change(screen.getByLabelText('Branch'), { target: { value: 'b1' } });
    await waitFor(() =>
      expect(posService.getFinanceOverview).toHaveBeenLastCalledWith(
        expect.objectContaining({ branchId: 'b1' }),
      ));
  });
});

describe('overview — the daily cash-flow question', () => {
  test('separates invoiced from collected and outstanding', async () => {
    await renderFinance();
    expect(screen.getByText('Invoiced')).toBeInTheDocument();
    expect(screen.getByText('Collected')).toBeInTheDocument();
    expect(screen.getByText('Outstanding')).toBeInTheDocument();
  });

  test('shows net position as collected minus spend', async () => {
    await renderFinance();
    // Scoped to its own card: the same figure legitimately appears again as
    // cash movement, and a bare text match would pass on the wrong one.
    expect(kpiValue('Net position')).toBe('₹186.00');
  });

  test('labels invoiced and collected distinctly so they cannot be confused', async () => {
    await renderFinance();
    expect(kpiValue('Invoiced')).toBe('₹266.00');
    expect(kpiValue('Collected')).toBe('₹266.00');
    expect(kpiValue('Spent')).toBe('₹80.00');
  });
});

describe('sales', () => {
  test('surfaces outstanding money rather than folding it into revenue', async () => {
    await renderFinance();
    await goToTab('Sales');
    expect(screen.getByText('Invoiced')).toBeInTheDocument();
    expect(screen.getByText('₹40.00')).toBeInTheDocument();
  });
});

describe('products — the analytics questions', () => {
  test('shows quantity sold and discount per product', async () => {
    await renderFinance();
    await goToTab('Products');
    expect(screen.getByText('Masala Dosa')).toBeInTheDocument();
    expect(screen.getByText('−₹20.00')).toBeInTheDocument();
  });

  test('ranks products and totals the units', async () => {
    await renderFinance();
    await goToTab('Products');
    expect(screen.getByText('Units')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});

describe('pending — two different questions', () => {
  test('reports unpaid documents and unbilled rounds separately', async () => {
    await renderFinance();
    await goToTab('Pending');
    expect(screen.getByText(/Unpaid documents/i)).toBeInTheDocument();
    expect(screen.getByText(/Unbilled rounds/i)).toBeInTheDocument();
    expect(screen.getByText('INV-0002')).toBeInTheDocument();
    expect(screen.getByText('ORD-9')).toBeInTheDocument();
  });
});

describe('tenders and cash flow', () => {
  test('shows the tender mix with money out netted', async () => {
    await renderFinance();
    await goToTab('Tenders');
    // "Cash" is both a tender and an account here, so match the row, not the text.
    const cashRow = rowStartingWith('Cash');
    expect(cashRow).toBeTruthy();
    expect(cashRow.textContent).toContain('−₹80.00'); // outflow shown as negative
    expect(cashRow.textContent).toContain('₹120.00'); // net after the expense
  });

  test('reports cash movement per account', async () => {
    await renderFinance();
    await goToTab('Cash Flow');
    expect(screen.getByText('Money in')).toBeInTheDocument();
    expect(screen.getByText('Money out')).toBeInTheDocument();
  });
});

describe('expenses tab', () => {
  test('breaks spend down by category with a share', async () => {
    await renderFinance();
    await goToTab('Expenses');
    expect(screen.getByText('Gas')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
  });
});

describe('failure handling', () => {
  test('shows an empty state instead of stale numbers when a report fails', async () => {
    posService.getFinanceOverview.mockRejectedValueOnce(new Error('boom'));
    render(<Finance />);
    await screen.findByText(/No data for this period/i);
  });
});

// Grouped on the venue snapshot each round froze, so a rearranged floor plan
// cannot move last month's revenue to a different floor.
describe('floors & tables — where the money was taken', () => {
  it('reports each floor and the tables beneath it', async () => {
    await renderFinance();
    await goToTab('Floors & Tables');

    // Floor names appear in both tables (their own row, and the Floor column of
    // the per-table view), so assert per section rather than globally.
    const [floorTable, tableTable] = screen.getAllByRole('table');
    expect(within(floorTable).getByText('Ground')).toBeInTheDocument();
    expect(within(floorTable).getByText('Rooftop')).toBeInTheDocument();
    expect(within(tableTable).getByText('T1')).toBeInTheDocument();
    expect(within(tableTable).getByText('R1')).toBeInTheDocument();
  });

  it('shows how hard a table works, not just what it took', async () => {
    await renderFinance();
    await goToTab('Floors & Tables');
    // Revenue per seat is what makes a 2-top and an 8-top comparable.
    expect(screen.getAllByText('₹59.00').length).toBeGreaterThan(0);
  });

  it('says nothing rather than inventing a per-seat figure without capacity', async () => {
    await renderFinance();
    await goToTab('Floors & Tables');
    const [, tableTable] = screen.getAllByRole('table');
    const row = within(tableTable).getByText('R1').closest('tr');
    expect(row).toHaveTextContent('—');
  });

  it('headlines the total so it can be checked against Sales', async () => {
    await renderFinance();
    await goToTab('Floors & Tables');
    expect(screen.getByText('₹944.00')).toBeInTheDocument();
  });
});

describe('discounts — what we gave away, and why', () => {
  it('separates a discount given on a dish from a bill-wide one', async () => {
    await renderFinance();
    await goToTab('Discounts');

    // "On Items" is both a KPI and a column header — the split is stated twice
    // on purpose, so match all of them.
    // "On Items" is both a KPI and a column header — the split is stated twice
    // on purpose. Assert the headline figures on the KPI cards specifically.
    const kpis = document.querySelectorAll('.fd-kpi-card');
    const kpiText = [...kpis].map((c) => c.textContent).join('|');
    expect(kpiText).toMatch(/On Items.*₹70\.00/);
    expect(kpiText).toMatch(/On Bills.*₹50\.00/);
    expect(kpiText).toMatch(/Total Discount.*₹120\.00/);
  });

  it('answers by product and by bill', async () => {
    await renderFinance();
    await goToTab('Discounts');
    expect(screen.getByText('Masala Dosa')).toBeInTheDocument();
    expect(screen.getByText('INV-0001')).toBeInTheDocument();
  });
});

// The mix-and-match half: the same reports, bounded by venue.
describe('venue filters', () => {
  it('passes the chosen floor to the API', async () => {
    await renderFinance();
    fireEvent.change(screen.getByLabelText('Floor'), { target: { value: 'f2' } });

    await waitFor(() => {
      const [args] = posService.getFinanceOverview.mock.calls.at(-1);
      expect(args.floorId).toBe('f2');
    });
  });

  it('narrows the table list to the chosen floor', async () => {
    // Offering every table would let someone pick a combination that cannot
    // exist and read the empty result as "no sales".
    await renderFinance();
    fireEvent.change(screen.getByLabelText('Floor'), { target: { value: 'f2' } });

    const options = [...screen.getByLabelText('Table').querySelectorAll('option')]
      .map((o) => o.textContent);
    expect(options).toContain('R1');
    expect(options).not.toContain('T1');
  });

  it('clears a stale table when the floor changes', async () => {
    await renderFinance();
    fireEvent.change(screen.getByLabelText('Table'), { target: { value: 't1' } });
    await waitFor(() => {
      expect(posService.getFinanceOverview.mock.calls.at(-1)[0].tableId).toBe('t1');
    });

    fireEvent.change(screen.getByLabelText('Floor'), { target: { value: 'f2' } });
    await waitFor(() => {
      expect(posService.getFinanceOverview.mock.calls.at(-1)[0].tableId).toBeUndefined();
    });
  });
});

// Counter sales were always in every total — a counter bill posts the same
// ledger document as any other — but nothing could NAME them, so "how much came
// over the counter today?" had no answer, and the venue report filed them under
// "No table" beside delivery.
describe('channels tab — where the sale happened', () => {
  it('names counter revenue, the figure that had no home before', async () => {
    await renderFinance();
    await goToTab('Channels');

    expect(kpiValue('Counter Revenue')).toBe('₹472.00');
    expect(kpiValue('Counter Bills')).toBe('9');
  });

  it('breaks the same money down by channel', async () => {
    await renderFinance();
    await goToTab('Channels');

    const counter = rowStartingWith('Counter');
    expect(within(counter).getByText('₹472.00')).toBeInTheDocument();
    expect(within(counter).getByText('28.57%')).toBeInTheDocument();
    expect(rowStartingWith('Dine-in')).toBeTruthy();
    expect(rowStartingWith('Delivery')).toBeTruthy();
  });

  // Average bill is what makes a counter and a dining room comparable at all.
  it('gives each channel an average bill', async () => {
    await renderFinance();
    await goToTab('Channels');
    expect(within(rowStartingWith('Counter')).getByText('₹52.44')).toBeInTheDocument();
  });

  it('shows how the queue performed beside what it earned', async () => {
    await renderFinance();
    await goToTab('Channels');

    expect(kpiValue('Tokens issued')).toBe('12');
    // Two distinct waits: issued→called is the customer's, called→collected is
    // how long they took to walk up.
    expect(kpiValue('Average wait')).toBe('4.5 min');
    expect(kpiValue('Longest wait')).toBe('15 min');
    expect(kpiValue('Collection time')).toBe('0.8 min');
  });

  // The queue half is gated on POS scopes; the money half is not. A finance
  // user without them must still get the report.
  it('still shows revenue when queue statistics are unavailable', async () => {
    posService.getChannelReport.mockResolvedValue({ ...CHANNELS, queue: null });
    await renderFinance();
    await goToTab('Channels');

    expect(kpiValue('Counter Revenue')).toBe('₹472.00');
    expect(screen.getByText(/not available for your access level/i)).toBeInTheDocument();
  });

  it('says so when no tokens were issued, rather than showing zeroes', async () => {
    posService.getChannelReport.mockResolvedValue({
      ...CHANNELS, queue: { range: RANGE, summary: { Issued: 0 }, trend: [] },
    });
    await renderFinance();
    await goToTab('Channels');
    expect(screen.getByText(/No counter tokens issued/i)).toBeInTheDocument();
  });

  it('sends the shared timeframe to the channel report like every other tab', async () => {
    await renderFinance();
    fireEvent.click(screen.getByRole('button', { name: 'This month' }));
    await goToTab('Channels');
    expect(posService.getChannelReport).toHaveBeenLastCalledWith(
      expect.objectContaining({ preset: 'month' }),
    );
  });
});


// ── Who bought it ──────────────────────────────────────────────────────────
// Ten tabs answer WHAT was sold. These two answer WHO bought it, which is the
// question a loyalty programme is built on.
describe('customers tab — credibility and repeat history', () => {
  test('measures identified sales against every sale, walk-ins included', async () => {
    await renderFinance();
    await goToTab('Customers');
    // 5 known orders of 10 documents. Computed over known customers only, the
    // figure would always look wonderful and mean nothing.
    expect(kpiValue('Identified sales')).toBe('50%');
    expect(screen.getByText('5 of 10 sales named a customer')).toBeInTheDocument();
  });

  test('reports the repeat rate over known customers', async () => {
    await renderFinance();
    await goToTab('Customers');
    expect(kpiValue('Repeat customers')).toBe('50%');
  });

  test('says what a low identified rate means rather than leaving it as a bad score', async () => {
    posService.getCustomerReport.mockResolvedValue({
      ...CUSTOMERS,
      summary: { ...CUSTOMERS.summary, IdentifiedRate: 20 },
    });
    await renderFinance();
    await goToTab('Customers');
    expect(screen.getByText(/Most sales here are walk-ins/i)).toBeInTheDocument();
  });

  test('does not nag when most sales already name a customer', async () => {
    posService.getCustomerReport.mockResolvedValue({
      ...CUSTOMERS,
      summary: { ...CUSTOMERS.summary, IdentifiedRate: 80 },
    });
    await renderFinance();
    await goToTab('Customers');
    expect(screen.queryByText(/Most sales here are walk-ins/i)).not.toBeInTheDocument();
  });

  test('marks who came back', async () => {
    await renderFinance();
    await goToTab('Customers');
    expect(within(rowStartingWith('Priya RRepeat')).getByText('Repeat')).toBeInTheDocument();
  });

  test('shows a one-time buyer as a first visit, never as "every 0 days"', async () => {
    await renderFinance();
    await goToTab('Customers');
    expect(within(rowStartingWith('Arjun')).getByText('first visit')).toBeInTheDocument();
    expect(within(rowStartingWith('Priya RRepeat')).getByText('6.3 days')).toBeInTheDocument();
  });

  test('lists lapsed customers by value, not by recency', async () => {
    await renderFinance();
    await goToTab('Customers');
    expect(screen.getByText(/Away more than 30 days, most valuable first/i)).toBeInTheDocument();
    expect(screen.getByText('Meera')).toBeInTheDocument();
  });

  test('keeps the credibility table when the lapsed list fails', async () => {
    // The lapsed panel decorates this tab; losing it must not blank the table
    // the tab exists for.
    posService.getLapsedReport.mockRejectedValue(new Error('nope'));
    await renderFinance();
    await goToTab('Customers');
    expect(screen.getByText('Priya R')).toBeInTheDocument();
    expect(screen.getByText(/lapsed-customer list could not be loaded/i)).toBeInTheDocument();
  });
});

describe('visit pattern — when they actually come in', () => {
  test('names the busiest slot in words a manager can act on', async () => {
    await renderFinance();
    await goToTab('Visit Pattern');
    expect(kpiValue('Busiest slot')).toBe('Wednesday 8p');
  });

  test('drops the hours that never trade instead of drawing 24 empty columns', async () => {
    await renderFinance();
    await goToTab('Visit Pattern');
    expect(kpiValue('Trading hours')).toBe('2');
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent))
      .toEqual(expect.arrayContaining(['Day', '1p', '8p', 'Total']));
  });

  test('shows every day, including the quiet ones', async () => {
    await renderFinance();
    await goToTab('Visit Pattern');
    ['Sunday', 'Monday', 'Wednesday', 'Saturday'].forEach((d) => {
      expect(screen.getAllByText(d).length).toBeGreaterThan(0);
    });
  });
});
