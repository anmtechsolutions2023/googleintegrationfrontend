import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import ReceiptFormat from '../ReceiptFormat';

// The editor carries NO field list. Everything it draws — sections, labels,
// allowed values, locks — arrives from the server, so these tests feed it a
// schema and assert it renders and returns exactly that.

jest.mock('../../../services/posService', () => ({
  __esModule: true,
  default: {
    getPosBranches: jest.fn(),
    getReceiptFormatSchema: jest.fn(),
    updateReceiptFormat: jest.fn(),
    setReceiptTaxMode: jest.fn(),
    getLedgerDocuments: jest.fn(),
    getLedgerDocument: jest.fn(),
  },
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('../../../context/AuthContext', () => ({ useAuth: jest.fn() }));

const posService = require('../../../services/posService').default;
const { useAuth } = require('../../../context/AuthContext');
const { toast } = require('react-toastify');

const asUser = (scopes) => useAuth.mockReturnValue({
  user: { tid: 't1', onboardingStatus: 'APPROVED', scopes },
});

const SCHEMA = (over = {}) => ({
  doc: 'bill', label: 'Bill', description: 'What the customer walks away with.',
  branchId: 'b-1', taxMode: 'gst',
  shop: { name: 'Sarjapura Foods', address: '142 Sarjapura Road', gstin: '29AABCS1429B1ZQ', fssai: '' },
  documents: [
    { key: 'bill', label: 'Bill' }, { key: 'creditNote', label: 'Credit note' },
    { key: 'kot', label: 'Kitchen ticket' }, { key: 'tokenSlip', label: 'Token slip' },
  ],
  sections: [
    { key: 'header', label: 'Header', fields: [
      { key: 'fssai', label: 'FSSAI licence', hint: 'A licence condition', type: 'visibility',
        states: ['always', 'never'], options: null, maxLength: null,
        default: 'always', value: 'always', locked: null, overridden: false },
      { key: 'gstin', label: 'GSTIN', hint: null, type: 'visibility',
        states: ['always', 'never'], options: null, maxLength: null,
        default: 'always', value: 'always',
        locked: { reason: 'Mandatory on a tax invoice', changeAt: 'Branch → Tax' }, overridden: false },
      { key: 'headerLine', label: 'Extra header line', hint: null, type: 'text',
        states: null, options: null, maxLength: 120,
        default: '', value: '', locked: null, overridden: false },
    ] },
    { key: 'identity', label: 'Identity', fields: [
      { key: 'customer', label: 'Customer name & mobile', hint: 'Most walk-ins give neither',
        type: 'visibility', states: ['always', 'if_present', 'never'], options: null, maxLength: null,
        default: 'if_present', value: 'if_present', locked: null, overridden: false },
    ] },
  ],
  ...over,
});

beforeEach(() => {
  asUser(['POS_CONFIG:WRITE']);
  posService.getPosBranches.mockResolvedValue([{ Id: 'b-1', BranchName: 'Sarjapura Road' }]);
  posService.getReceiptFormatSchema.mockResolvedValue(SCHEMA());
  posService.updateReceiptFormat.mockResolvedValue(SCHEMA());
  posService.setReceiptTaxMode.mockResolvedValue({});
  posService.getLedgerDocuments.mockResolvedValue([]);
  posService.getLedgerDocument.mockResolvedValue({});
});
afterEach(() => jest.clearAllMocks());

const renderPage = async () => {
  render(<ReceiptFormat />);
  await screen.findByText('FSSAI licence');
};

describe('the editor draws what the server sends', () => {
  test('sections, fields and hints', async () => {
    await renderPage();
    expect(screen.getByRole('heading', { name: 'Header' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Identity' })).toBeInTheDocument();
    expect(screen.getByText('A licence condition')).toBeInTheDocument();
  });

  test('and its own tabs, one per document type', async () => {
    await renderPage();
    ['Bill', 'Credit note', 'Kitchen ticket', 'Token slip'].forEach((label) => {
      expect(screen.getByRole('tab', { name: label })).toBeInTheDocument();
    });
  });

  // A boolean cannot express this, so the control must not be one.
  test('offers three states where the server says three', async () => {
    await renderPage();
    const tri = screen.getByRole('radiogroup', { name: 'Customer name & mobile' });
    expect(within(tri).getAllByRole('radio')).toHaveLength(3);
    expect(within(tri).getByRole('radio', { name: 'If present' })).toHaveAttribute('aria-checked', 'true');
  });

  test('and two where it says two', async () => {
    await renderPage();
    const tri = screen.getByRole('radiogroup', { name: 'FSSAI licence' });
    expect(within(tri).getAllByRole('radio')).toHaveLength(2);
  });

  test('a free-text field is an input, bounded by the server', async () => {
    await renderPage();
    expect(screen.getByLabelText('Extra header line')).toHaveAttribute('maxlength', '120');
  });
});

describe('locked fields', () => {
  // A settings screen that lets a restaurant print an illegal bill is a bad
  // settings screen.
  test('offer no control at all, and say why', async () => {
    await renderPage();
    expect(screen.queryByRole('radiogroup', { name: 'GSTIN' })).toBeNull();
    expect(screen.getByText('Mandatory on a tax invoice')).toBeInTheDocument();
  });

  test('point at the setting that would change it', async () => {
    await renderPage();
    expect(screen.getByTitle('Change at Branch → Tax')).toBeInTheDocument();
  });
});

describe('saving', () => {
  test('sends only what actually changed', async () => {
    await renderPage();
    const tri = screen.getByRole('radiogroup', { name: 'FSSAI licence' });
    fireEvent.click(within(tri).getByRole('radio', { name: 'Never' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(posService.updateReceiptFormat).toHaveBeenCalled());
    expect(posService.updateReceiptFormat).toHaveBeenCalledWith('b-1', 'bill', { fssai: 'never' });
  });

  test('Save is dead until something changes', async () => {
    await renderPage();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  test('Discard drops the edits and puts the field back', async () => {
    await renderPage();
    const tri = screen.getByRole('radiogroup', { name: 'FSSAI licence' });
    fireEvent.click(within(tri).getByRole('radio', { name: 'Never' }));
    expect(within(tri).getByRole('radio', { name: 'Never' })).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(within(tri).getByRole('radio', { name: 'Always' })).toHaveAttribute('aria-checked', 'true');
  });

  test('a refused save says why and keeps the edit', async () => {
    posService.updateReceiptFormat.mockRejectedValue({
      response: { data: { message: '“GSTIN” cannot be changed: Mandatory on a tax invoice.' } },
    });
    await renderPage();
    const tri = screen.getByRole('radiogroup', { name: 'FSSAI licence' });
    fireEvent.click(within(tri).getByRole('radio', { name: 'Never' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      '“GSTIN” cannot be changed: Mandatory on a tax invoice.',
    ));
    expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument();
  });
});

describe('the tax mode', () => {
  // It decides which fields are LOCKED, so the editor reloads rather than
  // guessing — guessing here would be a second copy of the server's rules.
  test('reloads the whole schema after changing', async () => {
    await renderPage();
    posService.getReceiptFormatSchema.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /Composition scheme/ }));

    await waitFor(() => expect(posService.setReceiptTaxMode).toHaveBeenCalledWith('b-1', 'composition'));
    await waitFor(() => expect(posService.getReceiptFormatSchema).toHaveBeenCalled());
  });

  test('shows which one is in force', async () => {
    await renderPage();
    expect(screen.getByRole('button', { name: /GST registered/ })).toHaveClass('is-on');
  });
});

describe('the preview', () => {
  // Sample data always has a customer AND a table AND a token, so every "if
  // present" field looks fine and the one that is never present is the one you
  // find out about on paper.
  test('uses the branch’s most recent settled sale', async () => {
    posService.getLedgerDocuments.mockResolvedValue([{ Id: 'l-1' }]);
    posService.getLedgerDocument.mockResolvedValue({
      TransactionNo: 'INV-0418', GrossAmount: 1121, Lines: [], Tenders: [],
    });
    await renderPage();

    await waitFor(() => expect(screen.getByText('your most recent sale')).toBeInTheDocument());
    expect(posService.getLedgerDocuments).toHaveBeenCalledWith(
      expect.objectContaining({ branchId: 'b-1', docType: 'POS Sale', status: 'SETTLED', limit: 1 }),
    );
  });

  test('says so when the branch has sold nothing yet', async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByText(/nothing sold yet/)).toBeInTheDocument());
  });

  test('reflects an unsaved edit immediately', async () => {
    await renderPage();
    await screen.findByTestId('receipt-bill');
    expect(within(screen.getByTestId('receipt-bill')).getByText(/FSSAI/)).toBeInTheDocument();

    const tri = screen.getByRole('radiogroup', { name: 'FSSAI licence' });
    fireEvent.click(within(tri).getByRole('radio', { name: 'Never' }));

    expect(within(screen.getByTestId('receipt-bill')).queryByText(/FSSAI/)).toBeNull();
  });
});

describe('who may change it', () => {
  // Changing what appears on a customer's bill is configuration, and the legal
  // fields it governs make it an administrator's decision.
  test('read-only for somebody without POS_CONFIG:WRITE', async () => {
    asUser(['POS_CONFIG:READ']);
    await renderPage();
    const tri = screen.getByRole('radiogroup', { name: 'FSSAI licence' });
    expect(within(tri).getByRole('radio', { name: 'Never' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Composition scheme/ })).toBeDisabled();
  });
});
