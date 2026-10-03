import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import Billing from '../Billing';

// The table board under the dish search: table first, then dishes.
// A 16-table outlet over two floors — open in step 1, folded to one row once
// a table is being served.

jest.mock('../../../services/posService', () => ({
  __esModule: true,
  default: {
    getTables: jest.fn(), getFloors: jest.fn(), getItemMeta: jest.fn(),
    getOrders: jest.fn(), getItemDetail: jest.fn(), getVariants: jest.fn(),
    getAddonGroups: jest.fn(), getAddons: jest.fn(),
    getPaymentModes: jest.fn(), getBranchPaymentMethods: jest.fn(), getKots: jest.fn(),
    quotePricing: jest.fn(), previewOffers: jest.fn(),
    createOrder: jest.fn(), updateOrder: jest.fn(), updateTable: jest.fn(),
    transferOrder: jest.fn(), deleteOrder: jest.fn(),
    fireKot: jest.fn(), createBill: jest.fn(), settleBill: jest.fn(),
    getPosSettings: jest.fn(), getWaiters: jest.fn(),
    getPendingQrOrders: jest.fn(),
  },
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock('../../../context/AuthContext', () => ({ useAuth: jest.fn() }));

const posService = require('../../../services/posService').default;
const { useAuth } = require('../../../context/AuthContext');

const minutesAgo = (m) => new Date(Date.now() - m * 60000).toISOString();

const G_SEATS = [2, 4, 4, 6, 2, 4, 8, 4];
const TABLES = [
  ...G_SEATS.map((c, i) => ({ Id: `g${i + 1}`, Name: `G-${i + 1}`, FloorId: 'ground', Status: 'free', Capacity: c })),
  ...Array.from({ length: 8 }, (_, i) => ({ Id: `f${i + 1}`, Name: `F-${i + 1}`, FloorId: 'first', Status: 'free', Capacity: 4 })),
];
TABLES[7].Status = 'reserved'; // G-8

const round = (id, tableId, mins, extra = {}) => ({
  Id: id, TableId: tableId, Status: 'fired', OrderNo: `ORD-${id}`, CreatedOn: minutesAgo(mins),
  SubTotal: 100, TaxAmount: 0, Total: 100,
  Items: [{ name: 'Chai', qty: 4, netAmount: 100, taxAmount: 0, grossAmount: 100 }],
  ...extra,
});
const ORDERS = [
  round('o1', 'g1', 50), // occupied, running long
  round('o2', 'g2', 20, { BillPrintedAt: minutesAgo(3) }), // bill printed
  round('o3', 'f3', 10), // occupied
];

beforeEach(() => {
  try { window.localStorage.clear(); } catch { /* fine */ }
  useAuth.mockReturnValue({ user: { tid: 't1', onboardingStatus: 'APPROVED', scopes: ['POS_ORDER:WRITE', 'POS_BILLING:WRITE'] } });
  posService.getTables.mockResolvedValue(TABLES);
  posService.getFloors.mockResolvedValue([{ Id: 'ground', Name: 'Ground' }, { Id: 'first', Name: 'First' }]);
  posService.getItemMeta.mockResolvedValue([]);
  posService.getItemDetail.mockResolvedValue({});
  posService.getOrders.mockResolvedValue(ORDERS);
  posService.getVariants.mockResolvedValue([]);
  posService.getAddonGroups.mockResolvedValue([]);
  posService.getAddons.mockResolvedValue([]);
  posService.getKots.mockResolvedValue([]);
  posService.getPaymentModes.mockResolvedValue([]);
  posService.getBranchPaymentMethods.mockResolvedValue({ methods: [] });
  posService.getPosSettings.mockResolvedValue({});
  posService.getWaiters.mockResolvedValue([]);
  posService.getPendingQrOrders.mockResolvedValue([]);
  posService.previewOffers.mockResolvedValue({ lineDiscounts: {}, applied: [] });
});
afterEach(() => jest.clearAllMocks());

const open = async () => {
  render(<Billing />);
  await screen.findByText(/Pick a table to start/i);
};
const board = () => screen.getByRole('region', { name: 'Tables' });
const tileFor = (name) => within(board()).getByRole('button', { name: new RegExp(`^${name}, `) });
const rowNames = () => within(screen.getByRole('group', { name: 'Table row' }))
  .getAllByRole('button').map((b) => b.querySelector('.fd-ttile-nm').textContent);

describe('step 1 — the board is open', () => {
  test('says how many tables are free, occupied, waiting on a bill and reserved', async () => {
    await open();
    const counts = within(board()).getByRole('group', { name: 'Show tables' });
    ['All 16', 'Free 12', 'Occupied 2', 'Bill printed 1', 'Reserved 1'].forEach((label) => {
      expect(within(counts).getByRole('button', { name: label })).toBeInTheDocument();
    });
    expect(board()).toHaveTextContent('3 of 16 seated · 19%');
  });

  test('lays every table out by floor, each floor with its free count', async () => {
    await open();
    const ground = within(board()).getByRole('group', { name: 'Ground tables' });
    expect(within(ground).getAllByRole('button')).toHaveLength(8);
    expect(ground).toHaveTextContent('5 free of 8');
    expect(within(board()).getByRole('group', { name: 'First tables' })).toHaveTextContent('7 free of 8');
  });

  test('a count filters the board, fading the rest without moving them', async () => {
    await open();
    fireEvent.click(within(board()).getByRole('button', { name: 'Free 12' }));
    expect(tileFor('G-1')).toHaveClass('is-faded');
    expect(tileFor('G-3')).not.toHaveClass('is-faded');
  });

  test('a floor tab shows just that floor', async () => {
    await open();
    fireEvent.click(within(board()).getByRole('button', { name: 'First floor, 8 tables' }));
    expect(within(board()).queryByRole('group', { name: 'Ground tables' })).not.toBeInTheDocument();
    expect(within(board()).getByRole('group', { name: 'First tables' })).toBeInTheDocument();
  });

  test('says each table\'s state in words, not only colour', async () => {
    await open();
    expect(tileFor('G-1').getAttribute('aria-label')).toMatch(/occupied, ₹100, 50 minutes, running long/);
    expect(tileFor('G-2').getAttribute('aria-label')).toMatch(/bill printed/);
    expect(tileFor('G-8').getAttribute('aria-label')).toMatch(/reserved/);
    expect(tileFor('G-4').getAttribute('aria-label')).toMatch(/free, 6 seats/);
  });

  test('the menu waits at half strength until a table is chosen', async () => {
    await open();
    expect(document.querySelector('.fd-billing-layout')).toHaveClass('is-picking');
  });
});

describe('seating a walk-in', () => {
  test('offers the smallest free table the party fits, and outlines it on the board', async () => {
    await open();
    // Two guests: G-1 and G-2 are taken, so the smallest free 2-seater is G-5.
    expect(screen.getByRole('button', { name: /^Seat at G-5 · Ground · 2 seats$/ })).toBeInTheDocument();
    expect(tileFor('G-5')).toHaveClass('is-suggest');
    expect(tileFor('G-5').getAttribute('aria-label')).toMatch(/suggested for 2 guests/);

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Guests in the party' }), { target: { value: '5' } });
    expect(screen.getByRole('button', { name: /^Seat at G-4/ })).toBeInTheDocument();
  });

  test('seating them opens the table with the party as its guests, and folds the board', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'One more guest' })); // 3
    fireEvent.click(screen.getByRole('button', { name: /^Seat at G-3/ }));

    await screen.findByText('Table G-3');
    expect(screen.getByRole('button', { name: /Guests and waiter: 3 guests/ })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Table row' })).toBeInTheDocument();
  });

  test('lists the tables needing attention, one tap each', async () => {
    await open();
    const attn = screen.getByRole('region', { name: 'Needs attention' });
    const items = within(attn).getAllByRole('button').map((b) => b.textContent);
    expect(items[0]).toMatch(/^G-2 · bill printed/);
    expect(items[1]).toMatch(/^G-1 · 50m/);

    fireEvent.click(within(attn).getAllByRole('button')[0]);
    await screen.findByText('Table G-2');
  });
});

describe('step 2 — the board folds to one row', () => {
  const serve = async (name) => {
    await open();
    fireEvent.click(tileFor(name));
    await screen.findByRole('group', { name: 'Table row' });
  };

  test('the table being served first, then bills, then longest-running, then free, then reserved', async () => {
    await serve('G-4');
    expect(rowNames()).toEqual([
      'G-4', 'G-2', 'G-1', 'F-3',
      'G-3', 'G-5', 'G-6', 'G-7', 'F-1', 'F-2', 'F-4', 'F-5', 'F-6', 'F-7', 'F-8',
      'G-8',
    ]);
    expect(screen.getByText('Serving G-4')).toBeInTheDocument();
  });

  test('tapping a table in the row switches to it in place', async () => {
    await serve('G-4');
    fireEvent.click(within(screen.getByRole('group', { name: 'Table row' })).getByRole('button', { name: /^F-3, / }));
    await screen.findByText('Table F-3');
  });

  test('All tables opens the board again; Hide and Escape fold it', async () => {
    await serve('G-4');
    fireEvent.click(screen.getByRole('button', { name: 'All tables ⌄' }));
    expect(within(board()).getByRole('group', { name: 'Show tables' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Hide ⌃' }));
    expect(screen.getByRole('group', { name: 'Table row' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'All tables ⌄' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByRole('group', { name: 'Table row' })).toBeInTheDocument();
  });

  test('a count in the row opens the board already filtered', async () => {
    await serve('G-4');
    fireEvent.click(screen.getByRole('button', { name: 'Free: 12. Show them' }));
    expect(within(board()).getByRole('button', { name: 'Free 12' })).toHaveAttribute('aria-pressed', 'true');
    expect(tileFor('G-1')).toHaveClass('is-faded');
  });

  test('the finder searches every table, and Enter opens the only match', async () => {
    await serve('G-4');
    const find = screen.getByRole('searchbox', { name: 'Find table' });
    fireEvent.change(find, { target: { value: 'f 7' } });
    expect(rowNames()).toEqual(['F-7']);
    fireEvent.keyDown(find, { key: 'Enter' });
    await screen.findByText('Table F-7');
  });

  test('flags a table whose guest has a QR order waiting', async () => {
    posService.getPendingQrOrders.mockResolvedValue([{ tableId: 'f3', tableName: 'F-3' }]);
    await serve('G-4');
    await waitFor(() => expect(tileFor('F-3').getAttribute('aria-label')).toMatch(/QR order waiting/));
  });
});

describe('with no tables', () => {
  test('shows no board and says how to add tables, or use takeaway', async () => {
    posService.getTables.mockResolvedValue([]);
    render(<Billing />);
    expect(await screen.findByText(/No tables set up yet/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Tables' })).not.toBeInTheDocument();
  });
});
