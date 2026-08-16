import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import TransferSheet from '../TransferSheet';

// t1 = source (occupied), t2 = free (offered), t3 = occupied (not offered).
const TABLES = [
  { Id: 't1', Name: 'T1', FloorId: 'ground', Status: 'occupied' },
  { Id: 't2', Name: 'R4', FloorId: 'rooftop', Status: 'free' },
  { Id: 't3', Name: 'R5', FloorId: 'rooftop', Status: 'occupied' },
];
const FLOORS = [
  { Id: 'ground', Name: 'Ground' },
  { Id: 'rooftop', Name: 'Rooftop' },
];
const R1 = { round: 1, orderId: 'o1', orderNo: 'ORD-1', items: [{ name: 'Paneer', qty: 1, grossAmount: 118 }] };
const R2 = { round: 2, orderId: 'o2', orderNo: 'ORD-2', items: [{ name: 'Tea', qty: 1, grossAmount: 40 }] };

const renderSheet = (props = {}) => {
  const onConfirm = jest.fn();
  render(
    <TransferSheet
      open onClose={() => {}} onConfirm={onConfirm}
      sourceTableId="t1" sourceTableLabel="Ground - T1"
      rounds={[R1]} activeOrderId="o1" tables={TABLES} floors={FLOORS}
      {...props}
    />,
  );
  return onConfirm;
};

const pickDestination = (label) => {
  fireEvent.click(screen.getByText('— Destination table —'));
  fireEvent.click(screen.getByText(label));
};

test('offers only free tables as a destination — not occupied ones or the source', () => {
  renderSheet();
  fireEvent.click(screen.getByText('— Destination table —'));
  const listbox = screen.getByRole('listbox');
  expect(within(listbox).getByText('Rooftop - R4')).toBeInTheDocument();   // free
  expect(within(listbox).queryByText('Rooftop - R5')).not.toBeInTheDocument(); // occupied
  expect(within(listbox).queryByText('Ground - T1')).not.toBeInTheDocument();  // source
});

test('transfers the active round as a complete order', () => {
  const onConfirm = renderSheet();
  pickDestination('Rooftop - R4');
  fireEvent.click(screen.getByRole('button', { name: /Move to Rooftop - R4/ }));
  expect(onConfirm).toHaveBeenCalledWith({ scope: 'orders', orderIds: ['o1'], toTableId: 't2' });
});

test('lets you pick a different round to transfer', () => {
  const onConfirm = renderSheet({ rounds: [R1, R2] });
  fireEvent.click(screen.getByText('Round 2 — ORD-2'));
  pickDestination('Rooftop - R4');
  fireEvent.click(screen.getByRole('button', { name: /Move to/ }));
  expect(onConfirm).toHaveBeenCalledWith({ scope: 'orders', orderIds: ['o2'], toTableId: 't2' });
});

test('can transfer the entire table when there are several rounds', () => {
  const onConfirm = renderSheet({ rounds: [R1, R2] });
  fireEvent.click(screen.getByText('Entire table'));
  pickDestination('Rooftop - R4');
  fireEvent.click(screen.getByRole('button', { name: /Move to/ }));
  expect(onConfirm).toHaveBeenCalledWith({ scope: 'orders', orderIds: ['o1', 'o2'], toTableId: 't2' });
});

test('cannot confirm before a destination is chosen', () => {
  renderSheet();
  expect(screen.getByRole('button', { name: /^Move$/ })).toBeDisabled();
});

test('warns when no free table is available', () => {
  renderSheet({ tables: [TABLES[0], TABLES[2]] }); // only occupied tables
  expect(screen.getByText(/No free tables available/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Move$/ })).toBeDisabled();
});
