import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import PosCrudPage from '../PosCrudPage';
import crudService from '../../../services/crudService';
import { genericGet } from '../../../services/posService';
import { useAuth } from '../../../context/AuthContext';
import { POS_MODULES } from '../../../config/posModules';

// The branch a floor belongs to, named.
//
// The branch picker is fed by POS_MODULES.posBranches, whose rows carry
// BranchName. The label lookup only consulted MODULES, so a POS reference found
// no displayField, fell through the generic name chain, and rendered the raw
// GUID — in the create form, the edit form, and the list column.

jest.mock('../../../services/posService', () => ({
  __esModule: true,
  genericGet: jest.fn(),
  genericPost: jest.fn(),
  genericPut: jest.fn(),
  genericDelete: jest.fn(),
}));
jest.mock('../../../services/crudService', () => ({
  __esModule: true,
  default: { getReferenceData: jest.fn() },
}));
jest.mock('../../../context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('react-toastify', () => ({
  toast: { error: jest.fn(), success: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

const BRANCH_ID = '9f1c0e2a-0000-4000-8000-000000000abc';
const BRANCHES = [{ Id: BRANCH_ID, BranchName: 'Sarjapura' }];
const FLOOR = { Id: 'f1', Name: 'Ground Floor', BranchDetailId: BRANCH_ID, Active: true };

const renderFloors = () => {
  useAuth.mockReturnValue({ user: { tid: 't1', scopes: ['TENANT_ADMIN'] } });
  return render(
    <PosCrudPage moduleConfig={POS_MODULES.posFloors} writeScopes={['TENANT_ADMIN']} />,
  );
};

const branchSelect = () => screen.getByLabelText(/Branch/i);

beforeEach(() => {
  jest.clearAllMocks();
  genericGet.mockResolvedValue({ success: true, message: [FLOOR] });
  crudService.getReferenceData.mockResolvedValue(BRANCHES);
});

it('names the branch in the create form instead of showing its id', async () => {
  renderFloors();
  await screen.findByText('Ground Floor');

  fireEvent.click(screen.getByRole('button', { name: /Add Floors/i }));

  await waitFor(() => expect(branchSelect()).toBeInTheDocument());
  const option = within(branchSelect()).getByRole('option', { name: 'Sarjapura' });
  expect(option).toHaveValue(BRANCH_ID);
  expect(within(branchSelect()).queryByRole('option', { name: BRANCH_ID })).toBeNull();
});

// The same lookup feeds the edit form, and it is the one the user opens on an
// existing floor — where a bare GUID gives no way to tell whether the branch
// already on the record is the right one.
it('names the branch in the edit form, with the record\'s branch selected', async () => {
  renderFloors();
  await screen.findByText('Ground Floor');

  fireEvent.click(screen.getByTitle('Edit'));

  await waitFor(() => expect(branchSelect()).toBeInTheDocument());
  expect(branchSelect()).toHaveValue(BRANCH_ID);
  expect(within(branchSelect()).getByRole('option', { name: 'Sarjapura' })).toBeInTheDocument();
});

it('names the branch in the list column', async () => {
  renderFloors();
  expect(await screen.findByText('Sarjapura')).toBeInTheDocument();
  expect(screen.queryByText(BRANCH_ID)).toBeNull();
});
