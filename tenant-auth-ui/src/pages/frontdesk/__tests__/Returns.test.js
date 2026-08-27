import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Returns from '../Returns';
import posService from '../../../services/posService';

// The returns register. What is asserted here is not "the table renders" — it
// is the handful of rules that make the screen trustworthy:
//
//   · Gross, Returns and Net stay three measures, never one netted figure.
//   · The rows and the totals above them cover the SAME window, because the
//     register is queried with the bounds the server resolved, not with a range
//     this component re-derived.
//   · Totals describe the whole filtered set, not the page.
//   · Every axis a business needs to search on actually reaches the API.

jest.mock('../../../services/posService', () => ({
  __esModule: true,
  default: {
    getSalesReport: jest.fn(),
    getReturnReasonsReport: jest.fn(),
    getReturnProductReport: jest.fn(),
    getReturnsRegister: jest.fn(),
    getRefundSettlementQueue: jest.fn(),
    setRefundSettlement: jest.fn(),
    getReturnReasons: jest.fn(),
    getPosBranches: jest.fn(),
  },
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));
jest.mock('../../../context/AuthContext', () => ({ useAuth: jest.fn() }));
const { useAuth } = require('../../../context/AuthContext');
const asUser = (scopes) => useAuth.mockReturnValue({
  user: { tid: 't1', onboardingStatus: 'APPROVED', scopes },
});

const RANGE = { from: '2026-08-01', to: '2026-08-27', bucket: 'day' };

const SALES = {
  range: RANGE,
  summary: {
    Documents: 412, GrossAmount: 486300, ReturnedAmount: 6240,
    NetOfReturns: 480060, ReturnRate: 1.28, ReturnCount: 37,
  },
  trend: [],
};

const REASONS = {
  range: RANGE,
  reasons: [
    { ReasonId: 'r-1', ReasonName: 'Quality complaint', ReasonCode: 'QUALITY', IsFault: true, ReturnCount: 14, ReturnedAmount: 3100, Share: 49.7 },
    { ReasonId: 'r-2', ReasonName: 'Customer changed mind', ReasonCode: 'CHANGED_MIND', IsFault: false, ReturnCount: 9, ReturnedAmount: 1400, Share: 22.4 },
  ],
  totals: { ReturnedAmount: 6240, FaultAmount: 4100, ReturnCount: 37 },
};

const PRODUCTS = {
  range: RANGE,
  products: [
    { ItemId: 'i-1', ItemName: 'Paneer Tikka', CategoryName: 'Starters', QuantityReturned: 9, QuantitySold: 40, ReturnRate: 22.5, ReturnedAmount: 2124, ReturnCount: 7 },
    { ItemId: 'i-2', ItemName: 'Naan', CategoryName: 'Breads', QuantityReturned: 6, QuantitySold: 500, ReturnRate: 1.2, ReturnedAmount: 708, ReturnCount: 4 },
  ],
};

const REGISTER = {
  data: [
    {
      Id: 'cn1', TransactionNo: 'CN-0034', TransactionDate: '2026-08-27',
      CreatedOn: '2026-08-27T19:14:00Z', CreatedBy: 'priya@test.com',
      GrossAmount: 472, NetAmount: 400, TaxAmount: 72,
      SaleId: 'l1', SaleNo: 'INV-0418', SaleGross: 1180, ShareOfSale: 40,
      ContactDetailId: 'c-1', CustomerName: 'Aarti K.', CustomerMobile: '9876500000',
      BranchName: 'Sarjapura', ReasonId: 'r-1', ReasonName: 'Quality complaint', IsFault: true,
      LineCount: 1, QuantityReturned: 2, ItemNames: '2 x Naan',
      RefundedTo: 'Cash', SettlementStatus: 'SETTLED',
    },
  ],
  totals: { ReturnedAmount: 6240, ReturnedNet: 5288, ReturnedTax: 952, ReturnCount: 37, FaultAmount: 4100 },
  pagination: { page: 1, limit: 25, total: 37, totalPages: 2 },
};

beforeEach(() => {
  asUser(['TRANSACTIONS:READ', 'TRANSACTIONS:WRITE']);
  posService.getSalesReport.mockResolvedValue(SALES);
  posService.getReturnReasonsReport.mockResolvedValue(REASONS);
  posService.getReturnProductReport.mockResolvedValue(PRODUCTS);
  posService.getReturnsRegister.mockResolvedValue(REGISTER);
  posService.getRefundSettlementQueue.mockResolvedValue([]);
  posService.setRefundSettlement.mockResolvedValue({});
  posService.getReturnReasons.mockResolvedValue([
    { Id: 'r-1', Name: 'Quality complaint' },
    { Id: 'r-2', Name: 'Customer changed mind' },
  ]);
  posService.getPosBranches.mockResolvedValue([{ Id: 'b-1', BranchName: 'Sarjapura' }]);
});

afterEach(() => jest.clearAllMocks());

const renderReturns = async () => {
  render(<MemoryRouter><Returns /></MemoryRouter>);
  await screen.findByText('CN-0034');
};

describe('the money strip', () => {
  // The whole reason a return is a document rather than a status: netting these
  // into one revenue figure is what made a closed period's gross move when
  // somebody refunded days later.
  test('shows gross, returns and net as three separate measures', async () => {
    await renderReturns();
    expect(screen.getByText('Gross sales')).toBeInTheDocument();
    expect(screen.getByText('Returned')).toBeInTheDocument();
    expect(screen.getByText('Net of returns')).toBeInTheDocument();
    expect(screen.getByText('₹4,86,300.00')).toBeInTheDocument();
    expect(screen.getByText('₹4,80,060.00')).toBeInTheDocument();
  });

  // "₹6,240 came back" is not actionable; "₹4,100 of it was our fault" is.
  test('splits out what was our fault', async () => {
    await renderReturns();
    // The fault filter offers an option of the same name, so scope to the strip.
    const fault = screen.getByText('Our fault', { selector: '.fd-returns-metric-label' })
      .closest('.fd-returns-metric');
    expect(within(fault).getByText('₹4,100.00')).toBeInTheDocument();
  });
});

describe('the register', () => {
  // The register is queried with the bounds the SERVER resolved from the preset,
  // not with a range re-derived here — otherwise the rows and the totals above
  // them could cover two different windows.
  test('queries the same window the reports resolved', async () => {
    await renderReturns();
    await waitFor(() => expect(posService.getReturnsRegister).toHaveBeenCalledWith(
      expect.objectContaining({ fromDate: '2026-08-01', toDate: '2026-08-27' }),
    ));
  });

  test('states that the totals cover the whole filtered set, not the page', async () => {
    await renderReturns();
    const note = screen.getByText(/matching these filters/);
    expect(note).toHaveTextContent('₹6,240.00');
    expect(note).toHaveTextContent('37');
  });

  test('shows where the money actually went, and what share of the sale came back', async () => {
    await renderReturns();
    const row = screen.getByText('CN-0034').closest('tr');
    expect(within(row).getByText('Cash')).toBeInTheDocument();
    expect(within(row).getByText('40.0%')).toBeInTheDocument();
    expect(within(row).getByText('our fault')).toBeInTheDocument();
    expect(within(row).getByText('priya@test.com')).toBeInTheDocument();
  });

  test('searches on whatever they remember', async () => {
    await renderReturns();
    fireEvent.change(screen.getByLabelText('Search returns'), { target: { value: 'INV-0418' } });
    await waitFor(() => expect(posService.getReturnsRegister).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: 'INV-0418' }),
    ));
  });

  test.each([
    ['Fault', 'true', 'isFault'],
    ['Settlement status', 'PENDING', 'settlementStatus'],
    ['Reason', 'r-2', 'reasonId'],
  ])('filters by %s', async (label, value, param) => {
    await renderReturns();
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
    await waitFor(() => expect(posService.getReturnsRegister).toHaveBeenLastCalledWith(
      expect.objectContaining({ [param]: value }),
    ));
  });

  test('filters by who refunded and by value', async () => {
    await renderReturns();
    fireEvent.change(screen.getByLabelText('Refunded by'), { target: { value: 'priya@test.com' } });
    fireEvent.change(screen.getByLabelText('Minimum amount'), { target: { value: '500' } });
    await waitFor(() => expect(posService.getReturnsRegister).toHaveBeenLastCalledWith(
      expect.objectContaining({ createdBy: 'priya@test.com', minAmount: '500' }),
    ));
  });

  // An empty filter must not be sent as an empty string — the server would
  // reject a blank uuid rather than treating it as "no filter".
  test('never sends an empty filter', async () => {
    await renderReturns();
    const [params] = posService.getReturnsRegister.mock.calls.at(-1);
    expect(Object.values(params)).not.toContain('');
  });

  test('goes back to page one when the filters change', async () => {
    await renderReturns();
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    await waitFor(() => expect(posService.getReturnsRegister)
      .toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })));

    fireEvent.change(screen.getByLabelText('Fault'), { target: { value: 'true' } });
    await waitFor(() => expect(posService.getReturnsRegister)
      .toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, isFault: 'true' })));
  });
});

describe('cross-links', () => {
  test('a credit note links to the invoice it came off', async () => {
    await renderReturns();
    const row = screen.getByText('CN-0034').closest('tr');
    expect(within(row).getByRole('button', { name: 'INV-0418' })).toBeInTheDocument();
  });

  // "Which customer does this keep happening with" — one click, not a new query.
  test('a customer filters the register to everything they returned', async () => {
    await renderReturns();
    const row = screen.getByText('CN-0034').closest('tr');
    fireEvent.click(within(row).getByRole('button', { name: 'Aarti K.' }));
    await waitFor(() => expect(posService.getReturnsRegister).toHaveBeenLastCalledWith(
      expect.objectContaining({ contactDetailId: 'c-1' }),
    ));
  });

  test('a dish filters the register to the notes it appears on', async () => {
    await renderReturns();
    fireEvent.click(screen.getByText('Paneer Tikka').closest('tr'));
    await waitFor(() => expect(posService.getReturnsRegister).toHaveBeenLastCalledWith(
      expect.objectContaining({ itemId: 'i-1' }),
    ));
  });

  test('a reason filters the register, and clicking it again clears it', async () => {
    await renderReturns();
    const reasonRow = screen.getAllByText('Quality complaint')[0].closest('tr');
    fireEvent.click(reasonRow);
    await waitFor(() => expect(posService.getReturnsRegister).toHaveBeenLastCalledWith(
      expect.objectContaining({ reasonId: 'r-1' }),
    ));
    fireEvent.click(reasonRow);
    await waitFor(() => {
      const [params] = posService.getReturnsRegister.mock.calls.at(-1);
      expect(params.reasonId).toBeUndefined();
    });
  });
});

describe('the settlement worklist', () => {
  const PENDING = [{
    Id: 'cn9', TransactionNo: 'CN-0040', SaleId: 'l2', SaleNo: 'INV-0420',
    CustomerName: 'Vikram', GrossAmount: 350, CreatedOn: '2026-08-27T20:00:00Z',
  }];

  // Usually empty — a till refund is instant — so it costs no space until
  // something is actually owed.
  test('stays out of the way when nothing is outstanding', async () => {
    await renderReturns();
    expect(screen.queryByText(/not yet handed back/i)).toBeNull();
    expect(screen.getByText('nothing outstanding')).toBeInTheDocument();
  });

  test('appears when money is owed, and can be cleared', async () => {
    posService.getRefundSettlementQueue.mockResolvedValue(PENDING);
    await renderReturns();
    const queue = (await screen.findByText(/not yet handed back/i)).closest('section');
    fireEvent.click(within(queue).getByRole('button', { name: /Handed over/i }));
    await waitFor(() => expect(posService.setRefundSettlement).toHaveBeenCalledWith(
      'cn9', { SettlementStatus: 'SETTLED' },
    ));
  });

  // Marking a refund handed over moves money. Reading the register does not.
  test('offers no settle action to somebody with read only', async () => {
    asUser(['TRANSACTIONS:READ']);
    posService.getRefundSettlementQueue.mockResolvedValue(PENDING);
    await renderReturns();
    const queue = (await screen.findByText(/not yet handed back/i)).closest('section');
    expect(within(queue).queryByRole('button', { name: /Handed over/i })).toBeNull();
  });
});

describe('resilience', () => {
  // The product panel decorates this screen; the money strip is what it exists
  // for. Losing one must not blank the other.
  test('keeps the money strip when the product report fails', async () => {
    posService.getReturnProductReport.mockRejectedValue(new Error('boom'));
    await renderReturns();
    expect(screen.getByText('₹4,86,300.00')).toBeInTheDocument();
    expect(screen.getByText('No items came back in this period.')).toBeInTheDocument();
  });

  test('does not fire a custom range without bounds', async () => {
    render(<MemoryRouter><Returns /></MemoryRouter>);
    await screen.findByText('CN-0034');
    posService.getReturnsRegister.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Custom range' }));
    expect(await screen.findByText(/Pick a start and end date/)).toBeInTheDocument();
    expect(posService.getReturnsRegister).not.toHaveBeenCalled();
  });
});
