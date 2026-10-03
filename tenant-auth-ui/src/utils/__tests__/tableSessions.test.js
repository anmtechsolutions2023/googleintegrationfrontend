import { suggestTable, needsAttention, sinceLabel, squashName } from '../tableSessions';

// Rows as tableInfo() returns them, cut down to what these rules read.
const t = (name, key, seats, extra = {}) => ({ id: name, name, key, seats, ...extra });

describe('the table offered to a walk-in party', () => {
  const floor = [
    t('G-1', 'free', 6),
    t('G-2', 'free', 2),
    t('G-3', 'occ', 2),
    t('G-4', 'free', 4),
    t('G-5', 'res', 2),
  ];

  it('is the smallest free table they fit, not the first free one', () => {
    expect(suggestTable(floor, 2)).toEqual({ table: floor[1], fits: true });
    expect(suggestTable(floor, 3).table.name).toBe('G-4');
    expect(suggestTable(floor, 5).table.name).toBe('G-1');
  });

  it('never offers an occupied or reserved table', () => {
    const names = [1, 2, 3, 4, 5, 6].map((n) => suggestTable(floor, n).table.name);
    expect(names.some((n) => n === 'G-3' || n === 'G-5')).toBe(false);
  });

  it('offers the biggest free table as a squeeze when nothing is big enough', () => {
    expect(suggestTable(floor, 9)).toEqual({ table: floor[0], fits: false });
  });

  it('treats a table with no seat count as fitting anyone', () => {
    expect(suggestTable([t('B-1', 'free', 0), t('B-2', 'free', 8)], 7).table.name).toBe('B-2');
    expect(suggestTable([t('B-1', 'free', 0)], 12)).toEqual({ table: expect.objectContaining({ name: 'B-1' }), fits: true });
  });

  it('has nothing to offer on a full floor', () => {
    expect(suggestTable([t('G-3', 'occ', 2)], 2)).toBeNull();
  });
});

describe('tables needing attention', () => {
  it('puts bills out first, then running long, longest first', () => {
    const list = needsAttention([
      t('A', 'occ', 4, { late: true, mins: 50 }),
      t('B', 'bill', 4),
      t('C', 'occ', 4, { late: false, mins: 20 }),
      t('D', 'occ', 4, { late: true, mins: 90 }),
    ]);
    expect(list.map((x) => x.name)).toEqual(['B', 'D', 'A']);
  });
});

describe('the small readers', () => {
  it('says how long, in minutes then hours', () => {
    const now = new Date('2026-10-03T12:00:00Z');
    expect(sinceLabel('2026-10-03T11:36:00Z', now)).toBe('24m');
    expect(sinceLabel('2026-10-03T10:55:00Z', now)).toBe('1h 05m');
    expect(sinceLabel(null, now)).toBe('');
  });

  it('finds a table however its name is typed', () => {
    expect(squashName('G - 12')).toBe(squashName('g12'));
  });
});
