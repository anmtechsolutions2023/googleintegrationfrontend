import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OrderLinkProvider, OrderNoLink } from '../OrderLinkProvider';
import posService from '../../../services/posService';

// The unified order-linking mechanism: an order number is a control wherever it
// appears, and every screen opens the SAME view of the order behind it.

jest.mock('../../../services/posService', () => ({
  __esModule: true,
  default: { getOrderDetail: jest.fn() },
}));

const COUNTER_ORDER = {
  Order: {
    Id: 'o1', OrderNo: 'ORD-0007', OrderType: 'takeaway', Status: 'closed',
    Items: [{ name: 'Burger', qty: 2, grossAmount: 270 }],
    SubTotal: 240, TaxAmount: 30, Total: 270, CreatedOn: '2026-08-20T19:48:29Z',
    TableId: null, TableName: null, FloorName: null,
  },
  Token: { Id: 'tk1', TokenLabel: '7', TokenNumber: 7, Status: 'served' },
  Kots: [{ Id: 'k1', KotNo: 'KOT-0009', Status: 'ready', FiredAt: '2026-08-20T19:49:00Z' }],
  Bill: { BillNo: 'BILL-0006', TransactionNo: 'INV-0006', LedgerStatus: 'SETTLED' },
  Source: { kind: 'token', label: '7' },
};

const TABLE_ORDER = {
  ...COUNTER_ORDER,
  Order: { ...COUNTER_ORDER.Order, OrderNo: 'ORD-0002', OrderType: 'dinein', TableName: 'G02', FloorName: 'Ground' },
  Token: null,
  Source: { kind: 'table', label: 'G02' },
};

const renderLink = (props = {}) => render(
  <OrderLinkProvider>
    <OrderNoLink orderId="o1" {...props}>ORD-0007</OrderNoLink>
  </OrderLinkProvider>,
);

beforeEach(() => {
  jest.clearAllMocks();
  posService.getOrderDetail.mockResolvedValue(COUNTER_ORDER);
});

describe('OrderNoLink', () => {
  // A styled span cannot be reached by keyboard and is not announced as a
  // control. An order number that opens something must be a button.
  it('renders as a real button when there is an order to open', () => {
    renderLink();
    expect(screen.getByRole('button', { name: /ORD-0007/ })).toBeInTheDocument();
  });

  it('renders plain text when there is no id — nothing to open', () => {
    render(
      <OrderLinkProvider>
        <OrderNoLink>ORD-0007</OrderNoLink>
      </OrderLinkProvider>,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('ORD-0007')).toBeInTheDocument();
  });

  it('opens the order it names', async () => {
    renderLink();
    fireEvent.click(screen.getByRole('button', { name: /ORD-0007/ }));
    await waitFor(() => expect(posService.getOrderDetail).toHaveBeenCalledWith('o1'));
  });
});

describe('OrderDetailModal — whose order is this?', () => {
  const open = async (detail) => {
    posService.getOrderDetail.mockResolvedValue(detail);
    renderLink();
    fireEvent.click(screen.getByRole('button', { name: /ORD-0007/ }));
    return screen.findByRole('dialog');
  };

  // The first question anyone clicking an order number has.
  it('leads with the TOKEN for a counter order', async () => {
    await open(COUNTER_ORDER);
    expect(await screen.findByText('Token')).toBeInTheDocument();
    expect(screen.getByText('7')).toHaveClass('fd-order-identity-value');
    expect(screen.getByText(/Counter order/i)).toBeInTheDocument();
  });

  it('leads with the TABLE for a dine-in order', async () => {
    await open(TABLE_ORDER);
    expect(await screen.findByText('Table')).toBeInTheDocument();
    expect(screen.getByText('G02')).toHaveClass('fd-order-identity-value');
    expect(screen.getByText(/Ground/)).toBeInTheDocument();
  });

  it('says so when an order has neither', async () => {
    await open({ ...TABLE_ORDER, Source: { kind: 'none', label: null },
      Order: { ...TABLE_ORDER.Order, TableName: null, FloorName: null } });
    expect(await screen.findByText(/No token or table/i)).toBeInTheDocument();
  });

  // Closing the loop from "an order number" to "what happened to it".
  it('shows the kitchen ticket and the invoice it was billed on', async () => {
    await open(COUNTER_ORDER);
    expect(await screen.findByText('KOT-0009')).toBeInTheDocument();
    expect(screen.getByText('INV-0006')).toBeInTheDocument();
  });

  it('says an unbilled round is still open rather than showing a blank', async () => {
    await open({ ...COUNTER_ORDER, Bill: null });
    expect(await screen.findByText(/Not billed yet/i)).toBeInTheDocument();
  });

  it('surfaces a load failure in the dialog, not behind it as a toast', async () => {
    posService.getOrderDetail.mockRejectedValue({ response: { data: { message: 'Order gone' } } });
    renderLink();
    fireEvent.click(screen.getByRole('button', { name: /ORD-0007/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Order gone');
  });

  it('closes on Escape', async () => {
    await open(COUNTER_ORDER);
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
