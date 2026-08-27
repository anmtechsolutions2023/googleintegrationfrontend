import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Reports from '../Reports';
import { OrderLinkProvider } from '../../../components/frontdesk/OrderLinkProvider';
import posService from '../../../services/posService';

// POS Reports showed its Recent Orders as plain text while the dashboard, the
// token queue and the ledger all made the order number a control. The data was
// never missing — /api/pos/reports has always selected o.Id — so this guards
// the wiring, not the payload.

jest.mock('../../../services/posService', () => ({
  __esModule: true,
  default: { getReports: jest.fn(), getOrderDetail: jest.fn() },
}));

const REPORT = {
  today: { revenue: 4820, orders: 12, pendingKots: 2 },
  tables: { total: 10, occupied: 3 },
  customers: { total: 88 },
  feedback: { avgRating: 4.3 },
  trends: { revenue: [], orders: [] },
  recentOrders: [
    {
      Id: 'o1', OrderNo: 'ORD-0042', OrderType: 'dinein', Status: 'closed',
      Total: 1240, CreatedOn: '2026-08-27T12:41:00Z',
    },
    // No id — a number with nothing behind it must not look clickable.
    { Id: null, OrderNo: 'ORD-0043', OrderType: 'takeaway', Status: 'open', Total: 380 },
  ],
};

const ORDER_DETAIL = {
  Order: {
    Id: 'o1', OrderNo: 'ORD-0042', OrderType: 'dinein', Status: 'closed',
    Items: [{ name: 'Biryani', qty: 2, grossAmount: 1240 }],
    SubTotal: 1100, TaxAmount: 140, Total: 1240, TableName: 'G02',
  },
  Token: null,
  Kots: [],
  Bill: { BillNo: 'BILL-0021', TransactionNo: 'INV-0021', LedgerStatus: 'SETTLED' },
  Source: { kind: 'table', label: 'G02' },
};

const renderReports = () => render(
  <OrderLinkProvider><Reports /></OrderLinkProvider>,
);

beforeEach(() => {
  jest.clearAllMocks();
  posService.getReports.mockResolvedValue(REPORT);
  posService.getOrderDetail.mockResolvedValue(ORDER_DETAIL);
});

describe('POS Reports — recent orders', () => {
  it('renders an order number with an id as a control', async () => {
    renderReports();
    const link = await screen.findByRole('button', { name: /view order ORD-0042/i });
    expect(link).toBeInTheDocument();
  });

  it('opens the order detail when the number is clicked', async () => {
    renderReports();
    fireEvent.click(await screen.findByRole('button', { name: /view order ORD-0042/i }));

    await waitFor(() => expect(posService.getOrderDetail).toHaveBeenCalledWith('o1'));
    expect(await screen.findByText('BILL-0021')).toBeInTheDocument();
  });

  it('leaves an order with no id as plain text', async () => {
    renderReports();
    expect(await screen.findByText('ORD-0043')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /view order ORD-0043/i }),
    ).not.toBeInTheDocument();
  });
});
