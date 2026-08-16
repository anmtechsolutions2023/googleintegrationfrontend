import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import Kitchen from '../Kitchen';
import posService from '../../../services/posService';

jest.mock('../../../services/posService', () => ({
  __esModule: true,
  default: {
    getKots: jest.fn(),
    getOrders: jest.fn(),
    getTables: jest.fn(),
    markKotReady: jest.fn(),
  },
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const TABLES = [{ Id: 't1', Name: 'RT02' }];

const burger = (variants = []) => ({ name: 'Burger', qty: 1, variants });

// Two rounds on one table, as the screenshot showed: round 1 plain, round 2 with
// options.
const ROUND_1 = {
  Id: 'o1', TableId: 't1', OrderNo: 'ORD-0001', Status: 'fired',
  CreatedOn: '2026-07-01 16:04:00', Items: [burger()],
};
const ROUND_2 = {
  Id: 'o2', TableId: 't1', OrderNo: 'ORD-0002', Status: 'fired',
  CreatedOn: '2026-07-01 16:06:00',
  Items: [
    burger([{ id: 'v1', name: 'Extra Panner', price: 40 }]),
    burger([
      { id: 'v1', name: 'Extra Panner', price: 40 },
      { id: 'v2', name: 'Extra Cheese', price: 20 },
    ]),
  ],
};

const kot = (id, orderId, extra = {}) => ({
  Id: id, KotNo: `KOT-000${id.slice(-1)}`, OrderId: orderId, TableId: 't1',
  Status: 'pending', FiredAt: '2026-07-01 16:07:25', Items: [], ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  posService.getTables.mockResolvedValue(TABLES);
  posService.getOrders.mockResolvedValue([ROUND_1, ROUND_2]);
  posService.getKots.mockResolvedValue([]);
  posService.markKotReady.mockResolvedValue({});
});

const renderKds = async () => {
  render(<Kitchen />);
  await waitFor(() => expect(posService.getKots).toHaveBeenCalled());
};

describe('KDS tile — says which round it is', () => {
  // The tile used to headline an opaque ticket number and show no round, order
  // number or placement time, even though pos_kot.OrderId was right there and
  // the orders were already loaded. Two tiles for the same table were
  // indistinguishable.
  test('headlines the round and order number, not just the ticket', async () => {
    posService.getKots.mockResolvedValue([kot('k2', 'o2', { Items: ROUND_2.Items })]);
    await renderKds();

    expect(await screen.findByText(/Round 2/)).toBeInTheDocument();
    expect(screen.getByText(/ORD-0002/)).toBeInTheDocument();
    expect(screen.getByText('KOT-0002')).toBeInTheDocument();
  });

  test('two tickets on one table read as different rounds', async () => {
    posService.getKots.mockResolvedValue([
      kot('k1', 'o1', { Items: ROUND_1.Items }),
      kot('k2', 'o2', { Items: ROUND_2.Items }),
    ]);
    await renderKds();

    expect(await screen.findByText(/Round 1/)).toBeInTheDocument();
    expect(screen.getByText(/Round 2/)).toBeInTheDocument();
  });

  test('shows variant prices, so the tile matches the round view line for line', async () => {
    posService.getKots.mockResolvedValue([kot('k2', 'o2', { Items: ROUND_2.Items })]);
    await renderKds();

    const chips = await screen.findAllByText(/Extra Panner \+₹40/);
    expect(chips.length).toBeGreaterThan(0);
    expect(screen.getByText(/Extra Cheese \+₹20/)).toBeInTheDocument();
  });

  // A line with no name used to render JSON.stringify(item) — raw JSON, on the
  // pass, in front of a cook.
  test('never dumps raw JSON for an unnamed line', async () => {
    posService.getKots.mockResolvedValue([
      kot('k1', 'o1', { Items: [{ qty: 2, costInfoId: 'ci-1' }] }),
    ]);
    await renderKds();

    expect(await screen.findByText(/Item/)).toBeInTheDocument();
    expect(screen.queryByText(/costInfoId/)).not.toBeInTheDocument();
  });
});

describe('KDS tile — status handling', () => {
  test('a ready ticket is filtered out of Pending, whatever its casing', async () => {
    posService.getKots.mockResolvedValue([
      kot('k1', 'o1', { Status: 'Ready' }),
      kot('k2', 'o2', { Status: 'pending' }),
    ]);
    await renderKds();

    await waitFor(() => expect(screen.getByText(/Round 2/)).toBeInTheDocument());
    expect(screen.queryByText(/Round 1/)).not.toBeInTheDocument();
  });

  test('offers Mark Ready only while the ticket is still pending', async () => {
    posService.getKots.mockResolvedValue([kot('k1', 'o1', { Status: 'ready' })]);
    await renderKds();

    fireEvent.click(screen.getByRole('button', { name: /^Ready$/ }));
    await waitFor(() => expect(screen.getByText(/Round 1/)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Mark Ready/i })).not.toBeInTheDocument();
  });
});

describe('KDS popup — marks the round you tapped', () => {
  test('opens the table’s rounds with this ticket’s round highlighted', async () => {
    posService.getKots.mockResolvedValue([kot('k2', 'o2', { Items: ROUND_2.Items })]);
    await renderKds();

    fireEvent.click(await screen.findByText(/Round 2/));

    const dialog = await screen.findByText(/Order Rounds/);
    const modal = dialog.closest('.fd-modal');
    // Both rounds are listed…
    expect(within(modal).getByText('ORD-0001')).toBeInTheDocument();
    expect(within(modal).getByText('ORD-0002')).toBeInTheDocument();
    // …and the one this ticket belongs to is called out.
    expect(within(modal).getByText(/this ticket/i)).toBeInTheDocument();
  });

  // The popup filtered to open orders, so a still-pending ticket for a settled
  // table opened an empty list next to a tile that was plainly still cooking.
  test('still lists the round after the table has been settled', async () => {
    posService.getOrders.mockResolvedValue([
      { ...ROUND_1, Status: 'closed' },
      { ...ROUND_2, Status: 'closed' },
    ]);
    posService.getKots.mockResolvedValue([kot('k2', 'o2', { Items: ROUND_2.Items })]);
    await renderKds();

    fireEvent.click(await screen.findByText(/Round 2/));

    const modal = (await screen.findByText(/Order Rounds/)).closest('.fd-modal');
    expect(within(modal).getByText('ORD-0002')).toBeInTheDocument();
    expect(within(modal).queryByText(/No orders found/)).not.toBeInTheDocument();
  });

  // The click keyed off TableId alone, so a takeaway ticket did nothing at all.
  test('a takeaway ticket with no table still opens its own round', async () => {
    posService.getOrders.mockResolvedValue([
      { ...ROUND_1, TableId: null, OrderNo: 'ORD-0009' },
    ]);
    posService.getKots.mockResolvedValue([
      kot('k1', 'o1', { TableId: null, Items: ROUND_1.Items }),
    ]);
    await renderKds();

    fireEvent.click(await screen.findByText(/Round 1/));

    const modal = (await screen.findByText(/Order Rounds/)).closest('.fd-modal');
    expect(within(modal).getByText('ORD-0009')).toBeInTheDocument();
  });
});
