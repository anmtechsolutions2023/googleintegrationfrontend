import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import ReturnPicker from '../ReturnPicker';

// Choosing what actually comes back.
//
// The rules here all protect the same thing: a cashier at a counter with a
// queue behind them should never be able to build a basket the server will
// refuse, and should never have to submit to find out what the customer gets.

const REASONS = [
  { Id: 'r-1', Name: 'Wrong item served' },
  { Id: 'r-2', Name: 'Customer changed mind' },
];

// A ₹1,180 invoice: 2 × Dosa (472) and 3 × Naan (708), with one naan already
// sent back on an earlier return.
const DOC = (over = {}) => ({
  Id: 'log-1',
  TransactionNo: 'INV-0042',
  GrossAmount: 1180,
  Lines: [
    { Id: 'line-dosa', ItemName: 'Dosa', Quantity: 2, ReturnedQty: 0, GrossAmount: 472, UnitPrice: 236 },
    { Id: 'line-naan', ItemName: 'Naan', Quantity: 3, ReturnedQty: 1, GrossAmount: 708, UnitPrice: 236 },
  ],
  ...over,
});

const setup = (over = {}, props = {}) => {
  const onConfirm = jest.fn();
  const onCancel = jest.fn();
  render(
    <ReturnPicker
      document={DOC(over)}
      reasons={REASONS}
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    />,
  );
  return { onConfirm, onCancel };
};

const qtyFor = (item) => screen.getByLabelText(new RegExp(`Quantity to return of ${item}`, 'i'));
const submit = () => screen.getByRole('button', { name: /^Return ₹/ });

describe('what can be selected', () => {
  it('shows what is already back, so nobody double-refunds by eye', () => {
    setup();
    const naanRow = screen.getByText('Naan').closest('tr');
    expect(within(naanRow).getByText('1')).toBeInTheDocument();
  });

  // The server refuses it too — that is where the guarantee lives, under a row
  // lock — but a screen that lets somebody build an invalid basket and only
  // says so on submit wastes their time at the counter.
  it('caps a line at what is actually left', () => {
    setup();
    fireEvent.change(qtyFor('Naan'), { target: { value: '3' } });
    // Three sold, one already back: two is the most that can come back now.
    expect(qtyFor('Naan')).toHaveValue(2);
  });

  it('refuses a negative quantity', () => {
    setup();
    fireEvent.change(qtyFor('Dosa'), { target: { value: '-5' } });
    expect(qtyFor('Dosa')).toHaveValue(null);
  });

  // Needs a second line with stock left, or the picker shows its
  // nothing-to-return state and there is no input to be disabled.
  it('disables a line that has already come back in full', () => {
    setup({
      Lines: [
        { Id: 'l1', ItemName: 'Dosa', Quantity: 2, ReturnedQty: 2, GrossAmount: 472 },
        { Id: 'l2', ItemName: 'Naan', Quantity: 3, ReturnedQty: 0, GrossAmount: 708 },
      ],
    });
    expect(qtyFor('Dosa')).toBeDisabled();
    expect(screen.getByText(/all returned/i)).toBeInTheDocument();
    // The line beside it is still selectable.
    expect(qtyFor('Naan')).toBeEnabled();
  });

  it('says so when there is nothing left to return at all', () => {
    setup({
      Lines: [{ Id: 'l1', ItemName: 'Dosa', Quantity: 1, ReturnedQty: 1, GrossAmount: 236 }],
    });
    expect(screen.getByText(/already been returned/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Return ₹/ })).toBeNull();
  });
});

describe('the live total', () => {
  // Priced the way the server prices it — a proportional share of what the
  // original line carried — so nobody has to submit to find out what the
  // customer gets back.
  it('prices a partial quantity proportionally', () => {
    setup();
    fireEvent.change(qtyFor('Dosa'), { target: { value: '1' } });
    // One of two dosas: half of 472.
    expect(submit()).toHaveTextContent('236.00');
  });

  it('adds up across lines', () => {
    setup();
    fireEvent.change(qtyFor('Dosa'), { target: { value: '1' } });   // 236
    fireEvent.change(qtyFor('Naan'), { target: { value: '2' } });   // 472
    expect(submit()).toHaveTextContent('708.00');
  });

  it('fills every remaining unit in one click', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /Return everything left/i }));
    expect(qtyFor('Dosa')).toHaveValue(2);
    expect(qtyFor('Naan')).toHaveValue(2);
    // 472 + 472.
    expect(submit()).toHaveTextContent('944.00');
  });
});

describe('what it will not submit', () => {
  it('will not submit with nothing selected', () => {
    setup();
    fireEvent.change(screen.getByLabelText(/^Reason$/i), { target: { value: 'r-1' } });
    expect(submit()).toBeDisabled();
  });

  // A coded reason is required because the report that groups them is the whole
  // point of having a taxonomy — free text cannot be grouped.
  it('will not submit without a reason', () => {
    setup();
    fireEvent.change(qtyFor('Dosa'), { target: { value: '1' } });
    expect(submit()).toBeDisabled();
  });

  it('submits the lines, quantities and reason the server expects', () => {
    const { onConfirm } = setup();
    fireEvent.change(qtyFor('Dosa'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/^Reason$/i), { target: { value: 'r-1' } });
    fireEvent.click(submit());

    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({
      lines: [{ lineId: 'line-dosa', quantity: 1 }],
      reasonId: 'r-1',
      destination: 'ORIGINAL',
    }));
  });

  // Store credit is a liability, not money out of the drawer — booking it as a
  // cash refund would make the till short by an amount that never left it.
  it('can send the refund to store credit instead of the original tender', () => {
    const { onConfirm } = setup();
    fireEvent.change(qtyFor('Dosa'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/^Reason$/i), { target: { value: 'r-1' } });
    fireEvent.change(screen.getByLabelText(/Refund to/i), { target: { value: 'STORE_CREDIT' } });
    fireEvent.click(submit());

    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ destination: 'STORE_CREDIT' }),
    );
  });

  it('locks the controls while the return is being recorded', () => {
    setup({}, { busy: true });
    expect(qtyFor('Dosa')).toBeDisabled();
    expect(screen.getByRole('button', { name: /Recording…/ })).toBeDisabled();
  });
});
