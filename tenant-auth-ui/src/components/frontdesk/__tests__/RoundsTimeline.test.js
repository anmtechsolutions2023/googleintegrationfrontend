import React from 'react';
import { render, screen, within, fireEvent } from '@testing-library/react';
import RoundsTimeline from '../RoundsTimeline';
import { itemVariants } from '../../../utils/posRounds';

// RoundsTimeline is shared by Billing, Tables and the KDS detail view, so what
// is verified here is what all three screens show for a past round.

const round = (items) => [{
  round: 1,
  orderId: 'o1',
  orderNo: 'ORD-1',
  time: '2026-07-01T10:00:00Z',
  items,
}];

describe('itemVariants', () => {
  it('normalizes stored variant objects', () => {
    expect(itemVariants({ variants: [{ id: 'v1', name: 'Large', price: 30 }] }))
      .toEqual([{ id: 'v1', name: 'Large', price: 30 }]);
  });

  it('accepts PascalCase keys', () => {
    expect(itemVariants({ Variants: [{ Id: 'v1', Name: 'Large', Price: '30' }] }))
      .toEqual([{ id: 'v1', name: 'Large', price: 30 }]);
  });

  it('returns an empty list for orders placed before variants shipped', () => {
    expect(itemVariants({ name: 'Dosa', qty: 1 })).toEqual([]);
    expect(itemVariants({})).toEqual([]);
    expect(itemVariants(null)).toEqual([]);
  });

  it('drops entries with no usable name', () => {
    expect(itemVariants({ variants: [{ id: 'v1' }, null] })).toEqual([]);
  });
});

describe('RoundsTimeline — past rounds', () => {
  it('shows the options chosen when the round was placed', () => {
    render(<RoundsTimeline rounds={round([
      { name: 'Masala Dosa', qty: 2, variants: [{ id: 'v1', name: 'Large', price: 30 }] },
    ])} />);

    expect(screen.getByText('Masala Dosa')).toBeInTheDocument();
    // A repeat order needs to show exactly what was served last time.
    expect(screen.getByText('Large +₹30.00')).toBeInTheDocument();
  });

  it('lists several options on one line', () => {
    render(<RoundsTimeline rounds={round([
      {
        name: 'Pizza', qty: 1,
        variants: [
          { id: 'v1', name: 'Large', price: 100 },
          { id: 'v2', name: 'Extra Cheese', price: 40 },
        ],
      },
    ])} />);

    expect(screen.getByText('Large +₹100.00')).toBeInTheDocument();
    expect(screen.getByText('Extra Cheese +₹40.00')).toBeInTheDocument();
  });

  it('omits the price when an option is free', () => {
    render(<RoundsTimeline rounds={round([
      { name: 'Tea', qty: 1, variants: [{ id: 'v1', name: 'No Sugar', price: 0 }] },
    ])} />);
    expect(screen.getByText('No Sugar')).toBeInTheDocument();
  });

  it('flags a line whose price already includes tax', () => {
    render(<RoundsTimeline rounds={round([
      { name: 'Combo', qty: 1, isTaxIncluded: true },
    ])} />);
    expect(screen.getByText('incl. tax')).toHaveClass('tax-flag', 'incl');
  });

  it('does not flag a tax-exclusive line', () => {
    render(<RoundsTimeline rounds={round([
      { name: 'Dosa', qty: 1, isTaxIncluded: false },
    ])} />);
    expect(screen.queryByText('incl. tax')).not.toBeInTheDocument();
  });

  it('renders an older order that has no variant data', () => {
    render(<RoundsTimeline rounds={round([{ name: 'Legacy Item', qty: 3 }])} />);
    const item = screen.getByText('Legacy Item').closest('li');
    expect(within(item).getByText('3x')).toBeInTheDocument();
  });

  it('still shows the empty state', () => {
    render(<RoundsTimeline rounds={[]} emptyMessage="Nothing here" />);
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
  });
});

describe('RoundsTimeline — inline round actions (Billing)', () => {
  const firedRound = [{
    round: 1, orderId: 'o1', orderNo: 'ORD-1', status: 'fired', time: '2026-07-01T10:00:00Z',
    items: [{ name: 'Dosa', qty: 1 }],
  }];

  it('shows the KOT status and a Delete button while the ticket is pending', () => {
    const onDelete = jest.fn();
    render(<RoundsTimeline rounds={firedRound} onDeleteRound={onDelete} kotStatusByOrder={{ o1: 'pending' }} />);

    expect(screen.getByText('KOT · pending')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Delete round 1/i }));
    expect(onDelete).toHaveBeenCalledWith(firedRound[0]);
  });

  it('locks deletion once the kitchen has started (kot past pending)', () => {
    render(<RoundsTimeline rounds={firedRound} onDeleteRound={jest.fn()} kotStatusByOrder={{ o1: 'ready' }} />);
    expect(screen.getByText('KOT · ready')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete round/i })).not.toBeInTheDocument();
    expect(screen.getByText('In kitchen')).toBeInTheDocument();
  });

  it('adds nothing extra on the Tables/KDS views (no callback)', () => {
    render(<RoundsTimeline rounds={firedRound} kotStatusByOrder={{ o1: 'pending' }} />);
    expect(screen.queryByText(/KOT/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete round/i })).not.toBeInTheDocument();
  });
});
