import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import OnlineOrders from '../../../pages/frontdesk/OnlineOrders';
import posService from '../../../services/posService';
import { useCan } from '../../../hooks/useCan';

// The expo queue.
//
// The behaviours here are the ones that decide whether a restaurant loses an
// order at Friday dinner, so they are asserted rather than assumed.

jest.mock('../../../services/posService', () => ({
  __esModule: true,
  default: {
    getOnlineOrderQueue: jest.fn(),
    acceptOnlineOrder: jest.fn(),
    rejectOnlineOrder: jest.fn(),
    setOnlineOrderStatus: jest.fn(),
    getPosBranches: jest.fn(),
    getPortals: jest.fn(),
    getPortalBranches: jest.fn(),
    setPortalBranchOnline: jest.fn(),
  },
}));
jest.mock('../../../hooks/useCan', () => ({ useCan: jest.fn() }));
jest.mock('react-toastify', () => ({
  toast: { error: jest.fn(), success: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

const { toast } = require('react-toastify');

const BRANCH = { Id: 'branch-1', BranchName: 'Sarjapura' };

const ZOMATO = {
  Id: 'portal-zo', Name: 'Zomato', Code: 'ZOMATO', ColorHex: '#E23744', ShortCode: 'ZO',
};
const SWIGGY = {
  Id: 'portal-sw', Name: 'Swiggy', Code: 'SWIGGY', ColorHex: '#F58220', ShortCode: 'SW',
};

const order = (over = {}) => ({
  Id: 'oo-1',
  PortalId: 'portal-zo',
  PortalName: 'Zomato',
  Platform: 'Zomato',
  ColorHex: '#E23744',
  ShortCode: 'ZO',
  ExternalRef: 'ZO-88231',
  Status: 'new',
  CustomerName: 'Aarti K.',
  BranchName: 'Sarjapura',
  GrossAmount: 842,
  NetPayout: 688.34,
  CommissionAmount: 153.66,
  CommissionPct: 18.3,
  ItemsTotal: 842,
  TaxAmount: 40.1,
  IsPrepaid: 1,
  HasUnmappedLines: 0,
  OrderLines: JSON.stringify([
    { unmapped: false, name: 'Paneer Tikka', qty: 2, grossAmount: 380 },
  ]),
  PlacedOn: new Date().toISOString(),
  ...over,
});

const renderQueue = async (orders = [order()], { canWrite = true } = {}) => {
  useCan.mockReturnValue(canWrite);
  posService.getOnlineOrderQueue.mockResolvedValue(orders);
  posService.getPosBranches.mockResolvedValue([BRANCH]);
  posService.getPortals.mockResolvedValue([ZOMATO, SWIGGY]);
  posService.getPortalBranches.mockImplementation((portalId) => Promise.resolve([
    {
      Id: `map-${portalId}`,
      PortalId: portalId,
      BranchDetailId: 'branch-1',
      BranchName: 'Sarjapura',
      IsOnline: 1,
    },
  ]));
  const view = render(<OnlineOrders />);
  await screen.findByText(/Zomato #ZO-88231|Nothing waiting/);
  return view;
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
});

describe('what the queue shows', () => {
  it('groups by urgency, not by portal', async () => {
    await renderQueue([
      order({ Id: 'oo-1', Status: 'new' }),
      order({ Id: 'oo-2', Status: 'accepted', ExternalRef: 'ZO-2' }),
    ]);

    expect(screen.getByText('Needs action')).toBeInTheDocument();
    expect(screen.getByText('In kitchen')).toBeInTheDocument();
  });

  // The number an owner actually cares about, which the old table never showed.
  it('shows net payout beside the gross', async () => {
    await renderQueue();
    expect(screen.getByText('₹842.00')).toBeInTheDocument();
    expect(screen.getByText('net ₹688.34')).toBeInTheDocument();
  });

  // Colour must never be the only signal: this screen is read by a colour-blind
  // cashier and on a washed-out counter tablet.
  it('identifies a portal by monogram and name, not by colour alone', async () => {
    await renderQueue();
    // Twice over: once on the portal strip, once on the card.
    expect(screen.getAllByText('ZO').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Zomato/).length).toBeGreaterThan(0);
  });

  // The portal's colour comes from pos_portal.ColorHex, so a new portal needs
  // no code change here at all.
  it('paints the portal rail from the colour the API sent', async () => {
    await renderQueue();
    screen.getAllByText('ZO').forEach((el) => {
      expect(el).toHaveStyle({ background: '#E23744' });
    });
  });

  it('flags an order carrying a line that matched nothing on our menu', async () => {
    await renderQueue([order({ HasUnmappedLines: 1 })]);
    expect(screen.getByText(/Unmapped item/i)).toBeInTheDocument();
  });

  it('tells an empty queue apart from a broken one', async () => {
    await renderQueue([]);
    expect(screen.getByText(/Nothing waiting/i)).toBeInTheDocument();
  });
});

describe('arrivals are announced, not left to be noticed', () => {
  // The rule lives in the hook and is transport-independent, so it is driven
  // here through a refetch rather than the poll timer — what matters is that an
  // order which was NOT there last time raises the banner, not what triggered
  // the fetch.
  //
  // A missed toast is a missed order, and the accept SLA is about two minutes,
  // so the banner is persistent and has to be dismissed by hand.
  it('raises a persistent banner when a new order appears', async () => {
    await renderQueue([order()]);

    // The first load is the baseline — everything already on screen when
    // somebody opens the page must not alarm.
    expect(screen.queryByText(/need.? accepting/i)).toBeNull();

    posService.getOnlineOrderQueue.mockResolvedValue([
      order(), order({ Id: 'oo-2', ExternalRef: 'ZO-9' }),
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => expect(
      screen.getByText(/1 new order needs accepting/i),
    ).toBeInTheDocument());

    // And it stays until acknowledged, rather than fading like a toast.
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(screen.queryByText(/needs accepting/i)).toBeNull());
  });

  it('does not re-alarm for an order it has already shown', async () => {
    await renderQueue([order()]);

    posService.getOnlineOrderQueue.mockResolvedValue([order(), order({ Id: 'oo-2', ExternalRef: 'ZO-9' })]);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await screen.findByText(/1 new order needs accepting/i);

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(screen.queryByText(/needs accepting/i)).toBeNull());

    // Same two orders come back on the next poll — neither is new any more.
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(posService.getOnlineOrderQueue).toHaveBeenCalledTimes(3));
    expect(screen.queryByText(/needs accepting/i)).toBeNull();
  });
});

describe('acting on an order', () => {
  it('accepts, and says the ticket went to the kitchen', async () => {
    posService.acceptOnlineOrder.mockResolvedValue({
      OrderNo: 'ORD-0007', Kot: { KotNo: 'KOT-0012' },
    });
    await renderQueue();

    fireEvent.click(screen.getAllByRole('button', { name: 'Accept' })[0]);

    await waitFor(() => expect(posService.acceptOnlineOrder).toHaveBeenCalledWith('oo-1', {}));
    expect(toast.success).toHaveBeenCalledWith(
      expect.stringContaining('KOT-0012'),
    );
  });

  // The portal push never undoes the accept, so a failure has to be said out
  // loud rather than swallowed — otherwise the order is live with us and
  // pending with them, and nobody knows.
  it('warns when the order was accepted but the portal was not told', async () => {
    posService.acceptOnlineOrder.mockResolvedValue({
      OrderNo: 'ORD-0007',
      PortalPush: { pushed: false, detail: 'HTTP 503' },
    });
    await renderQueue();

    fireEvent.click(screen.getAllByRole('button', { name: 'Accept' })[0]);
    await waitFor(() => expect(toast.warn).toHaveBeenCalledWith(
      expect.stringContaining('HTTP 503'),
    ));
  });

  it('shows the server message when an accept is refused', async () => {
    posService.acceptOnlineOrder.mockRejectedValue({
      response: { data: { message: 'Cannot move an order from "accepted" to "accepted".' } },
    });
    await renderQueue();

    fireEvent.click(screen.getAllByRole('button', { name: 'Accept' })[0]);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      'Cannot move an order from "accepted" to "accepted".',
    ));
  });

  // Portals require a coded reason, so the button stays off until there is one.
  it('will not reject without a reason', async () => {
    await renderQueue();
    fireEvent.click(screen.getAllByRole('button', { name: 'Reject' })[0]);

    const dialog = await screen.findByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: /Reject order/i });
    expect(confirm).toBeDisabled();

    fireEvent.click(within(dialog).getByLabelText('Out of stock'));
    expect(confirm).toBeEnabled();

    posService.rejectOnlineOrder.mockResolvedValue({});
    fireEvent.click(confirm);
    await waitFor(() => expect(posService.rejectOnlineOrder).toHaveBeenCalledWith(
      'oo-1', expect.objectContaining({ Reason: 'out_of_stock' }),
    ));
  });

  // The food arrived. A settle failure must not be dressed up as success, nor
  // make the delivery look like it did not happen.
  it('reports a delivered order that could not be settled', async () => {
    posService.setOnlineOrderStatus.mockResolvedValue({
      Status: 'delivered',
      Settlement: { settled: false, error: 'no settlement payment mode configured' },
    });
    await renderQueue([order({ Status: 'out for delivery' })]);

    fireEvent.click(screen.getAllByRole('button', { name: 'Delivered' })[0]);
    await waitFor(() => expect(toast.warn).toHaveBeenCalledWith(
      expect.stringContaining('payment mode'),
    ));
  });

  it('offers no actions to somebody who can only watch', async () => {
    await renderQueue([order()], { canWrite: false });
    expect(screen.queryByRole('button', { name: 'Accept' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull();
  });
});

describe('the kill switch', () => {
  // The most consequential control on the screen, and it must not need a
  // manager — a kitchen that is underwater cannot wait for one.
  it('pauses a portal for this branch', async () => {
    posService.setPortalBranchOnline.mockResolvedValue({});
    await renderQueue();

    const pause = await screen.findAllByRole('button', { name: 'Pause' });
    fireEvent.click(pause[0]);

    await waitFor(() => expect(posService.setPortalBranchOnline).toHaveBeenCalledWith(
      expect.any(String), expect.objectContaining({ IsOnline: false }),
    ));
  });
});

describe('the keyboard, for a screen operated standing up', () => {
  it('accepts the selected order on A', async () => {
    posService.acceptOnlineOrder.mockResolvedValue({ OrderNo: 'ORD-1' });
    await renderQueue();

    fireEvent.click(screen.getByText(/Zomato #ZO-88231/));
    fireEvent.keyDown(window, { key: 'a' });

    await waitFor(() => expect(posService.acceptOnlineOrder).toHaveBeenCalledWith('oo-1', {}));
  });

  // Typing "a" into the search box must not accept an order.
  it('ignores keys typed into an input', async () => {
    await renderQueue();
    const input = document.createElement('input');
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: 'a' });
    expect(posService.acceptOnlineOrder).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });
});
