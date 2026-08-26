import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import ImportDrawer from '../ImportDrawer';
import importService from '../../../services/importService';
import posService from '../../../services/posService';

// The import drawer, and mostly the CHECK state — which is the feature.
//
// Anyone can post an array. What makes an import trustworthy is being told,
// before committing, exactly what a file will do: how many items, which already
// exist, which rows cannot be read, and whether the tax group it names will
// price the whole menu at 0%.

jest.mock('../../../services/importService', () => ({
  __esModule: true,
  default: { importItems: jest.fn(), publishMenuEntries: jest.fn(), previewChecks: jest.fn() },
}));
jest.mock('../../../services/posService', () => ({
  __esModule: true,
  default: { getPosBranches: jest.fn() },
}));
jest.mock('react-toastify', () => ({
  toast: { error: jest.fn(), success: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

const GOOD = `name,category,unit,price,tax_group
Plain Tea,Tea,Glass,15,GST 5%
Mango Lassi,Lassi,Glass,80,GST 5%
Oreo Milkshake,Milkshake,Glass,119,GST 5%`;

const paste = (text) => {
  fireEvent.change(screen.getByPlaceholderText(/name,category,unit/i), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: /Check file/i }));
};

beforeEach(() => {
  jest.clearAllMocks();
  importService.previewChecks.mockResolvedValue([]);
  posService.getPosBranches.mockResolvedValue([]);
  importService.importItems.mockResolvedValue({
    summary: { total: 3, created: 3, updated: 0, skipped: 0, failed: 0 },
    created: { categories: 3, units: 1, taxGroups: 1 },
    rows: [
      { row: 1, name: 'Plain Tea', status: 'created' },
      { row: 2, name: 'Mango Lassi', status: 'created' },
      { row: 3, name: 'Oreo Milkshake', status: 'created' },
    ],
  });
});

const open = () => render(<ImportDrawer onClose={jest.fn()} onImported={jest.fn()} />);

describe('checking a file before anything is written', () => {
  it('counts what the file will create', async () => {
    open();
    paste(GOOD);
    expect(await screen.findByText(/3 items will be created/i)).toBeInTheDocument();
    expect(screen.getByText('3 categories')).toBeInTheDocument();
    expect(screen.getByText('1 unit')).toBeInTheDocument();
  });

  it('writes nothing until the import is confirmed', async () => {
    open();
    paste(GOOD);
    await screen.findByText(/3 items will be created/i);
    expect(importService.importItems).not.toHaveBeenCalled();
    expect(screen.getByText(/Nothing has been saved yet/i)).toBeInTheDocument();
  });

  // The 1O9 case — a letter O for a zero, the way a real spreadsheet fails.
  it('names the row it cannot read, and why', async () => {
    open();
    paste(`name,category,unit,price,tax_group
Plain Tea,Tea,Glass,15,GST 5%
Butterfly,Mocktail Mania,Glass,1O9,GST 5%`);

    expect(await screen.findByText(/1 row cannot be read/i)).toBeInTheDocument();
    expect(screen.getByText(/price “1O9” is not a number/i)).toBeInTheDocument();
    // …and the good row is still going in.
    expect(screen.getByText(/1 item will be created/i)).toBeInTheDocument();
  });

  it('says which column is missing rather than just refusing', async () => {
    open();
    paste('name,category,unit,price,tax_group\n,Tea,Glass,15,GST 5%');
    expect(await screen.findByText(/name is required/i)).toBeInTheDocument();
  });

  // A file naming the same drink twice would have the second row skip the first.
  it('catches a name that appears twice in the same file', async () => {
    open();
    paste(`name,category,unit,price,tax_group
Plain Tea,Tea,Glass,15,GST 5%
Plain Tea,Tea,Glass,20,GST 5%`);
    expect(await screen.findByText(/appears twice in the file/i)).toBeInTheDocument();
  });

  // The warning that only exists because of how this codebase behaves.
  it('warns that a tax group with no tax types prices at 0%', async () => {
    importService.previewChecks.mockResolvedValue(['GST 5%']);
    open();
    paste(GOOD);
    expect(await screen.findByText(/has no tax types — these prices will compute 0% tax/i))
      .toBeInTheDocument();
  });

  it('carries on when that check itself fails — it is advice, not a gate', async () => {
    importService.previewChecks.mockRejectedValue(new Error('down'));
    open();
    paste(GOOD);
    expect(await screen.findByRole('button', { name: /Import 3 items/i })).toBeEnabled();
  });
});

describe('the duplicate policy', () => {
  it('skips by default — a re-run must not overwrite a corrected price', async () => {
    open();
    paste(GOOD);
    fireEvent.click(await screen.findByRole('button', { name: /Import 3 items/i }));
    await waitFor(() => expect(importService.importItems).toHaveBeenCalled());
    expect(importService.importItems.mock.calls[0][1]).toBe('skip');
  });

  it('updates only when asked explicitly', async () => {
    open();
    paste(GOOD);
    fireEvent.click(await screen.findByRole('checkbox', { name: /Update items that already exist/i }));
    fireEvent.click(screen.getByRole('button', { name: /Import 3 items/i }));
    await waitFor(() => expect(importService.importItems.mock.calls[0][1]).toBe('update'));
  });
});

describe('running it', () => {
  it('sends only the rows that passed', async () => {
    open();
    paste(`name,category,unit,price,tax_group
Plain Tea,Tea,Glass,15,GST 5%
Butterfly,Mocktail Mania,Glass,1O9,GST 5%`);
    fireEvent.click(await screen.findByRole('button', { name: /Import 1 item/i }));

    await waitFor(() => expect(importService.importItems).toHaveBeenCalled());
    const [rows] = importService.importItems.mock.calls[0];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: 'Plain Tea', price: 15, taxGroup: 'GST 5%' });
    // The line number is a preview concern; the API never sees it.
    expect(rows[0].__line).toBeUndefined();
    expect(rows[0].line).toBeUndefined();
  });

  it('defaults tax_included to true — a board price is what the customer pays', async () => {
    open();
    paste(GOOD);
    fireEvent.click(await screen.findByRole('button', { name: /Import 3 items/i }));
    await waitFor(() => expect(importService.importItems).toHaveBeenCalled());
    expect(importService.importItems.mock.calls[0][0][0].taxIncluded).toBe(true);
  });

  it('reports the outcome of every row', async () => {
    importService.importItems.mockResolvedValue({
      summary: { total: 3, created: 1, updated: 0, skipped: 1, failed: 1 },
      created: {},
      rows: [
        { row: 1, name: 'Plain Tea', status: 'created' },
        { row: 2, name: 'Mango Lassi', status: 'skipped', reason: 'An item with this name already exists' },
        { row: 3, name: 'Oreo Milkshake', status: 'failed', reason: 'Duplicate entry' },
      ],
    });
    open();
    paste(GOOD);
    fireEvent.click(await screen.findByRole('button', { name: /Import 3 items/i }));

    expect(await screen.findByText(/already exists/i)).toBeInTheDocument();
    expect(screen.getByText('Duplicate entry')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Download failed rows/i })).toBeInTheDocument();
  });

  it('offers no failed-rows download when nothing failed', async () => {
    open();
    paste(GOOD);
    fireEvent.click(await screen.findByRole('button', { name: /Import 3 items/i }));
    await screen.findByText(/All rows accounted for/i);
    expect(screen.queryByRole('button', { name: /Download failed rows/i })).not.toBeInTheDocument();
  });
});

describe('publishing to a branch', () => {
  beforeEach(() => {
    posService.getPosBranches.mockResolvedValue([{ Id: 'b1', BranchName: 'Sarjapura' }]);
    importService.publishMenuEntries.mockResolvedValue({
      summary: { total: 3, created: 3, skipped: 0, failed: 0 }, rows: [],
    });
  });

  it('is offered only when the tenancy has a branch', async () => {
    open();
    paste(GOOD);
    expect(await screen.findByRole('checkbox', { name: /Also publish to a branch/i })).toBeInTheDocument();
  });

  it('is off unless chosen, and then runs as a second pass', async () => {
    open();
    paste(GOOD);
    fireEvent.click(await screen.findByRole('checkbox', { name: /Also publish to a branch/i }));
    fireEvent.click(screen.getByRole('button', { name: /Import 3 items/i }));

    await waitFor(() => expect(importService.publishMenuEntries).toHaveBeenCalled());
    expect(importService.publishMenuEntries.mock.calls[0][0]).toMatchObject({ branchDetailId: 'b1' });
  });

  it('does not publish when it was not asked for', async () => {
    open();
    paste(GOOD);
    fireEvent.click(await screen.findByRole('button', { name: /Import 3 items/i }));
    await screen.findByText(/All rows accounted for/i);
    expect(importService.publishMenuEntries).not.toHaveBeenCalled();
  });

  // Publishing a row that failed pass one would just fail again with a worse
  // message.
  it('publishes only what actually landed', async () => {
    importService.importItems.mockResolvedValue({
      summary: { total: 3, created: 2, updated: 0, skipped: 0, failed: 1 },
      created: {},
      rows: [
        { row: 1, name: 'Plain Tea', status: 'created' },
        { row: 2, name: 'Mango Lassi', status: 'created' },
        { row: 3, name: 'Oreo Milkshake', status: 'failed', reason: 'nope' },
      ],
    });
    open();
    paste(GOOD);
    fireEvent.click(await screen.findByRole('checkbox', { name: /Also publish to a branch/i }));
    fireEvent.click(screen.getByRole('button', { name: /Import 3 items/i }));

    await waitFor(() => expect(importService.publishMenuEntries).toHaveBeenCalled());
    const names = importService.publishMenuEntries.mock.calls[0][0].items.map((i) => i.name);
    expect(names).toEqual(['Plain Tea', 'Mango Lassi']);
  });

  // The thing the whole design is for, said to the person who just did it.
  it('says the imported items behave like any other', async () => {
    open();
    paste(GOOD);
    fireEvent.click(await screen.findByRole('checkbox', { name: /Also publish to a branch/i }));
    fireEvent.click(screen.getByRole('button', { name: /Import 3 items/i }));
    expect(await screen.findByText(/behaves exactly like one typed in by hand/i)).toBeInTheDocument();
  });
});

// The two columns that used to do nothing.
describe('tax rates', () => {
  const WITH_RATES = `name,category,unit,price,tax_group,tax_components
Plain Tea,Tea,Glass,15,GST 5%,CGST:2.5|SGST:2.5`;

  it('sends the components the file states', async () => {
    open();
    paste(WITH_RATES);
    fireEvent.click(await screen.findByRole('button', { name: /Import 1 item/i }));

    await waitFor(() => expect(importService.importItems).toHaveBeenCalled());
    expect(importService.importItems.mock.calls[0][0][0].taxComponents).toEqual([
      { name: 'CGST', value: 2.5 }, { name: 'SGST', value: 2.5 },
    ]);
  });

  it('counts the tax types it will create', async () => {
    open();
    paste(WITH_RATES);
    expect(await screen.findByText('2 tax types')).toBeInTheDocument();
  });

  // The default is a product decision, and one taken against my own advice —
  // so it must be visible before it is applied, never discovered afterwards.
  it('announces the default when a row states no rate', async () => {
    open();
    paste(GOOD);
    expect(await screen.findByText(/3 rows state no tax rate — CGST:2.5 \+ SGST:2.5 will be applied/i))
      .toBeInTheDocument();
  });

  it('says nothing about defaults when every row states its own', async () => {
    open();
    paste(WITH_RATES);
    await screen.findByText('2 tax types');
    expect(screen.queryByText(/will be applied/i)).not.toBeInTheDocument();
  });

  it('refuses a malformed component rather than guessing', async () => {
    open();
    paste(`name,category,unit,price,tax_group,tax_components
Plain Tea,Tea,Glass,15,GST 5%,CGST`);
    expect(await screen.findByText(/should look like CGST:2.5/i)).toBeInTheDocument();
  });

  it('refuses a rate that is not a number', async () => {
    open();
    paste(`name,category,unit,price,tax_group,tax_components
Plain Tea,Tea,Glass,15,GST 5%,CGST:two`);
    expect(await screen.findByText(/tax rate “two” is not a number/i)).toBeInTheDocument();
  });
});

describe('food type', () => {
  const MIXED = `name,category,unit,price,tax_group,food_type
Plain Tea,Tea,Glass,15,GST 5%,Veg
Chicken Roll,Snacks,Plate,120,GST 5%,Non-Veg`;

  beforeEach(() => {
    posService.getPosBranches.mockResolvedValue([{ Id: 'b1', BranchName: 'Sarjapura' }]);
    importService.publishMenuEntries.mockResolvedValue({
      summary: { total: 2, created: 2, skipped: 0, failed: 0 }, rows: [],
    });
    importService.importItems.mockResolvedValue({
      summary: { total: 2, created: 2, updated: 0, skipped: 0, failed: 0 },
      created: {},
      rows: [
        { row: 1, name: 'Plain Tea', status: 'created' },
        { row: 2, name: 'Chicken Roll', status: 'created' },
      ],
    });
  });

  it('is shown per row, because it now has consequences', async () => {
    open();
    paste(MIXED);
    expect(await screen.findByText('Non-Veg')).toBeInTheDocument();
  });

  // THE defect: the row's own value was dropped and everything published Veg.
  it('carries each row’s own value through to the publish pass', async () => {
    open();
    paste(MIXED);
    fireEvent.click(await screen.findByRole('checkbox', { name: /Also publish to a branch/i }));
    fireEvent.click(screen.getByRole('button', { name: /Import 2 items/i }));

    await waitFor(() => expect(importService.publishMenuEntries).toHaveBeenCalled());
    expect(importService.publishMenuEntries.mock.calls[0][0].items).toEqual([
      { name: 'Plain Tea', foodType: 'Veg' },
      { name: 'Chicken Roll', foodType: 'Non-Veg' },
    ]);
  });

  it('leaves a blank one to the default rather than inventing a value', async () => {
    importService.importItems.mockResolvedValue({
      summary: { total: 1, created: 1, updated: 0, skipped: 0, failed: 0 },
      created: {}, rows: [{ row: 1, name: 'Plain Tea', status: 'created' }],
    });
    open();
    paste('name,category,unit,price,tax_group\nPlain Tea,Tea,Glass,15,GST 5%');
    fireEvent.click(await screen.findByRole('checkbox', { name: /Also publish to a branch/i }));
    fireEvent.click(screen.getByRole('button', { name: /Import 1 item/i }));

    await waitFor(() => expect(importService.publishMenuEntries).toHaveBeenCalled());
    expect(importService.publishMenuEntries.mock.calls[0][0].items[0].foodType).toBeUndefined();
  });
});
