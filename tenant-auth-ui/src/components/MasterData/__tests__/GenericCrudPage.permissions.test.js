import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import GenericCrudPage from '../GenericCrudPage';
import crudService from '../../../services/crudService';
import { useAuth } from '../../../context/AuthContext';

// A master-data module page, seen by somebody who should not be there.
//
// The page has always checked the module's category scopes; what changed is
// that the checks now engage. Every role used to be granted READ on all twelve
// categories by the seed, so a cashier held MASTER_DATA:READ and these branches
// were unreachable in practice.

let mockParams = { moduleKey: 'taxTypes' };
jest.mock('react-router-dom', () => ({
  useParams: () => mockParams,
  useNavigate: () => jest.fn(),
}));
jest.mock('../../../services/crudService', () => ({
  __esModule: true,
  default: {
    getAll: jest.fn(),
    getReferenceData: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  },
}));
const forbidden = () => Object.assign(new Error('Forbidden'), { response: { status: 403 } });
jest.mock('../../../context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('react-toastify', () => ({
  toast: { error: jest.fn(), success: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

// The scopes a POS_CASHIER holds once the blanket grant is gone.
const CASHIER = ['POS_ORDER:READ', 'POS_ORDER:WRITE', 'POS_BILLING:READ',
  'POS_BILLING:WRITE', 'POS_CRM:READ', 'POS_CONFIG:READ'];

const renderAs = (scopes, moduleKey = 'taxTypes') => {
  mockParams = { moduleKey };
  useAuth.mockReturnValue({ user: { tid: 't1', onboardingStatus: 'APPROVED', scopes } });
  return render(<GenericCrudPage />);
};

beforeEach(() => {
  jest.clearAllMocks();
  crudService.getAll.mockResolvedValue({ data: [], pagination: { total: 0 } });
  crudService.getReferenceData.mockResolvedValue([]);
});

describe('a user without the category', () => {
  it('is refused, and told which permission is missing', async () => {
    renderAs(CASHIER);
    expect(await screen.findByText(/Access Denied/i)).toBeInTheDocument();
    expect(screen.getByText('MASTER_DATA:READ')).toBeInTheDocument();
  });

  // Refusing after fetching would still have leaked the rows into the browser.
  it('never asks the API for the rows', async () => {
    renderAs(CASHIER);
    await screen.findByText(/Access Denied/i);
    expect(crudService.getAll).not.toHaveBeenCalled();
  });

  // Holding one category is not holding another: a cashier who was given
  // INVENTORY:READ for the till still has no business in tax types.
  it('is refused even when they can read a DIFFERENT category', async () => {
    renderAs([...CASHIER, 'INVENTORY:READ']);
    expect(await screen.findByText(/Access Denied/i)).toBeInTheDocument();
  });
});

describe('a user with read but not write', () => {
  it('sees the rows', async () => {
    renderAs(['MASTER_DATA:READ']);
    await waitFor(() => expect(crudService.getAll).toHaveBeenCalled());
    expect(screen.queryByText(/Access Denied/i)).not.toBeInTheDocument();
  });

  it('is offered no way to add one', async () => {
    renderAs(['MASTER_DATA:READ']);
    await waitFor(() => expect(crudService.getAll).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /Add/i })).not.toBeInTheDocument();
  });
});

describe('a user with write', () => {
  it('gets the create button', async () => {
    renderAs(['MASTER_DATA:READ', 'MASTER_DATA:WRITE']);
    await waitFor(() => expect(crudService.getAll).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: /Add/i })).toBeInTheDocument();
  });

  // A tenant admin holds neither category scope explicitly; checkScope and
  // hasScope both admit them by administration.
  it('as does a tenant admin, who holds no category scope at all', async () => {
    renderAs(['TENANT:SUPER_ADMIN']);
    await waitFor(() => expect(crudService.getAll).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: /Add/i })).toBeInTheDocument();
  });
});

// A master-data screen can legitimately reference a category the user cannot
// read — Branch Details lists addresses, Batch Details lists branches. Those
// lists are NOT widened to whoever holds the owning screen's scope; that would
// undo the tightening. So the form has to say what happened, because an empty
// dropdown and a forbidden one look the same.
describe('a dropdown whose list the role may not read', () => {
  const openForm = async () => {
    await waitFor(() => expect(crudService.getAll).toHaveBeenCalled());
    fireEvent.click(await screen.findByRole('button', { name: /Add/i }));
  };

  it('says it is a permission, not an empty list', async () => {
    crudService.getReferenceData.mockRejectedValue(forbidden());
    renderAs(['ORGANIZATION:READ', 'ORGANIZATION:WRITE'], 'branchDetails');
    await openForm();

    // Branch Details references several categories; each refused one says so.
    const notes = await screen.findAllByText(/do not have permission to read/i);
    expect(notes.length).toBeGreaterThan(0);
    expect(notes[0]).toHaveTextContent(/so this cannot be set here/i);
  });

  it('warns when the blocked field is one the record cannot be saved without', async () => {
    crudService.getReferenceData.mockRejectedValue(forbidden());
    renderAs(['ORGANIZATION:READ', 'ORGANIZATION:WRITE'], 'branchDetails');
    await openForm();

    expect((await screen.findAllByText(/required to save/i)).length).toBeGreaterThan(0);
  });

  // An ordinary failure is not a permission problem and must not be described
  // as one — that would send somebody to their admin over a dropped request.
  it('describes a plain failure as a failure', async () => {
    crudService.getReferenceData.mockRejectedValue(new Error('network'));
    renderAs(['ORGANIZATION:READ', 'ORGANIZATION:WRITE'], 'branchDetails');
    await openForm();

    expect((await screen.findAllByText(/could not be loaded/i)).length).toBeGreaterThan(0);
    expect(screen.queryAllByText(/do not have permission/i)).toHaveLength(0);
  });

  it('leaves a working dropdown alone', async () => {
    crudService.getReferenceData.mockResolvedValue([{ Id: 'x1', Name: 'Central' }]);
    renderAs(['ORGANIZATION:READ', 'ORGANIZATION:WRITE'], 'branchDetails');
    await openForm();

    expect(screen.queryByText(/do not have permission/i)).not.toBeInTheDocument();
  });
});

// Bulk import is a TENANT ADMIN act, deliberately narrower than the write scope
// that governs this screen: one run creates categories, units, tax groups and
// items across the whole tenancy. The API refuses everybody else, and offering a
// button the server will refuse is exactly the failure this mirrors.
describe('the Import button', () => {
  it('is offered to a tenant admin on a screen that supports it', async () => {
    renderAs(['TENANT:ADMIN'], 'itemDetails');
    await waitFor(() => expect(crudService.getAll).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: /Import/i })).toBeInTheDocument();
  });

  it('is withheld from somebody who can only WRITE the category', async () => {
    renderAs(['INVENTORY:READ', 'INVENTORY:WRITE'], 'itemDetails');
    await waitFor(() => expect(crudService.getAll).toHaveBeenCalled());
    // They can still add one item by hand — that is the point of the boundary.
    expect(screen.getByRole('button', { name: /Add/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Import/i })).not.toBeInTheDocument();
  });

  // Only screens that opt in with bulkImport get it; a tax type or a UOM is not
  // a catalogue and does not need one.
  it('does not appear on a screen that has not opted in', async () => {
    renderAs(['TENANT:ADMIN'], 'taxTypes');
    await waitFor(() => expect(crudService.getAll).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /Import/i })).not.toBeInTheDocument();
  });
});
