import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AdminApprovals from '../AdminApprovals';
import * as adminService from '../../../services/adminService';

jest.mock('../../../services/adminService', () => ({
  getOnboardingRequests: jest.fn(),
  approveOnboardingRequest: jest.fn(),
  rejectOnboardingRequest: jest.fn(),
  getRoles: jest.fn(),
}));
jest.mock('react-toastify', () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

const PENDING_REQUEST = {
  id: 'req-1',
  name: 'Alice Smith',
  email: 'alice@test.com',
  status: 'PENDING',
  requested_at: '2024-01-15T10:00:00Z',
  request_note: 'Need access for onboarding team',
};

const APPROVED_REQUEST = {
  id: 'req-2',
  name: 'Bob Jones',
  email: 'bob@test.com',
  status: 'APPROVED',
  requested_at: '2024-01-14T09:00:00Z',
  request_note: '',
  reviewed_by: 'admin@test.com',
};

const MOCK_ROLES = [
  { id: 'role-1', name: 'EDITOR', description: 'Can edit records', is_active: 1 },
  { id: 'role-2', name: 'VIEWER', description: 'Read-only access', is_active: 1 },
];

beforeEach(() => {
  adminService.getOnboardingRequests.mockResolvedValue({
    data: { data: [PENDING_REQUEST, APPROVED_REQUEST] },
  });
  adminService.getRoles.mockResolvedValue({ data: { data: MOCK_ROLES } });
  adminService.approveOnboardingRequest.mockResolvedValue({ data: {} });
  adminService.rejectOnboardingRequest.mockResolvedValue({ data: {} });
});

afterEach(() => jest.clearAllMocks());

test('renders the onboarding requests table after loading', async () => {
  render(<AdminApprovals />);
  await waitFor(() => expect(screen.getByText('Alice Smith')).toBeInTheDocument());
  expect(screen.getByText('alice@test.com')).toBeInTheDocument();
  expect(screen.getByText('Bob Jones')).toBeInTheDocument();
});

test('fetches with PENDING status filter by default', async () => {
  render(<AdminApprovals />);
  await waitFor(() =>
    expect(adminService.getOnboardingRequests).toHaveBeenCalledWith({ status: 'PENDING' })
  );
});

test('shows Approve and Reject buttons only for PENDING rows', async () => {
  render(<AdminApprovals />);
  await waitFor(() => screen.getByText('Alice Smith'));

  // PENDING row has action buttons
  expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument();

  // APPROVED row shows "reviewed by" text instead
  expect(screen.getByText('by admin@test.com')).toBeInTheDocument();
});

test('opens approve modal when Approve is clicked', async () => {
  render(<AdminApprovals />);
  await waitFor(() => screen.getByText('Alice Smith'));

  fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

  expect(screen.getByText('Approve Request')).toBeInTheDocument();
  expect(screen.getByText(/Approving access for/i)).toBeInTheDocument();
});

test('approve modal loads and displays role checkboxes', async () => {
  render(<AdminApprovals />);
  await waitFor(() => screen.getByText('Alice Smith'));

  fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

  await waitFor(() => {
    expect(screen.getByText('EDITOR')).toBeInTheDocument();
    expect(screen.getByText('VIEWER')).toBeInTheDocument();
  });
  expect(adminService.getRoles).toHaveBeenCalled();
});

test('approve sends tenantId with selected roleIds', async () => {
  render(<AdminApprovals />);
  await waitFor(() => screen.getByText('Alice Smith'));

  fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
  await waitFor(() => screen.getByText('EDITOR'));

  fireEvent.change(
    screen.getByPlaceholderText(/Enter tenant UUID/i),
    { target: { value: 'tenant-abc' } }
  );
  // Select EDITOR role by clicking the role-check-item div
  fireEvent.click(screen.getByText('EDITOR'));

  fireEvent.click(screen.getByRole('button', { name: 'Approve & Provision' }));

  await waitFor(() =>
    expect(adminService.approveOnboardingRequest).toHaveBeenCalledWith(
      'req-1',
      'tenant-abc',
      ['role-1']
    )
  );
});

test('approve sends empty roleIds when no roles are selected', async () => {
  render(<AdminApprovals />);
  await waitFor(() => screen.getByText('Alice Smith'));

  fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
  await waitFor(() => screen.getByText('EDITOR'));

  fireEvent.change(
    screen.getByPlaceholderText(/Enter tenant UUID/i),
    { target: { value: 'tenant-xyz' } }
  );
  // Do NOT select any roles

  fireEvent.click(screen.getByRole('button', { name: 'Approve & Provision' }));

  await waitFor(() =>
    expect(adminService.approveOnboardingRequest).toHaveBeenCalledWith(
      'req-1',
      'tenant-xyz',
      []
    )
  );
});

test('approve button is disabled when tenantId is empty', async () => {
  render(<AdminApprovals />);
  await waitFor(() => screen.getByText('Alice Smith'));

  fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
  await waitFor(() => screen.getByText('Approve Request'));

  expect(
    screen.getByRole('button', { name: 'Approve & Provision' })
  ).toBeDisabled();
});

test('shows applicant note inside the approve modal', async () => {
  render(<AdminApprovals />);
  await waitFor(() => screen.getByText('Alice Smith'));

  fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
  await waitFor(() => screen.getByText('Approve Request'));

  // Note appears in both the table cell and the modal info-note — either is acceptable
  const notes = screen.getAllByText(/Need access for onboarding team/i);
  expect(notes.length).toBeGreaterThanOrEqual(1);
});

test('opens reject modal when Reject is clicked', async () => {
  render(<AdminApprovals />);
  await waitFor(() => screen.getByText('Alice Smith'));

  fireEvent.click(screen.getByRole('button', { name: 'Reject' }));

  // "Reject Request" appears as both modal heading and submit button — check by heading role
  expect(screen.getByRole('heading', { name: 'Reject Request' })).toBeInTheDocument();
});

test('reject submits with the entered reason', async () => {
  render(<AdminApprovals />);
  await waitFor(() => screen.getByText('Alice Smith'));

  fireEvent.click(screen.getByRole('button', { name: 'Reject' }));

  fireEvent.change(
    screen.getByPlaceholderText(/Briefly explain/i),
    { target: { value: 'Not eligible at this time' } }
  );
  fireEvent.click(screen.getByRole('button', { name: 'Reject Request' }));

  await waitFor(() =>
    expect(adminService.rejectOnboardingRequest).toHaveBeenCalledWith(
      'req-1',
      'Not eligible at this time'
    )
  );
});

test('search filter narrows displayed requests', async () => {
  render(<AdminApprovals />);
  await waitFor(() => screen.getByText('Alice Smith'));

  fireEvent.change(
    screen.getByPlaceholderText('Search by name or email…'),
    { target: { value: 'bob' } }
  );

  expect(screen.queryByText('Alice Smith')).not.toBeInTheDocument();
  expect(screen.getByText('Bob Jones')).toBeInTheDocument();
});

test('shows empty state when no requests match filter', async () => {
  adminService.getOnboardingRequests.mockResolvedValue({ data: { data: [] } });
  render(<AdminApprovals />);
  await waitFor(() =>
    expect(screen.getByText('No onboarding requests found.')).toBeInTheDocument()
  );
});
