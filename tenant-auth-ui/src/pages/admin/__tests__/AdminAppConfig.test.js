import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AdminAppConfig from '../AdminAppConfig';
import * as adminService from '../../../services/adminService';

jest.mock('../../../services/adminService', () => ({
  getAppConfig: jest.fn(),
  updateAppConfig: jest.fn(),
}));
jest.mock('react-toastify', () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

afterEach(() => jest.clearAllMocks());

const toggle = () => screen.getByLabelText(/Auto-approve new onboarding requests/i);

test('loads and reflects the current auto-approve flag (off)', async () => {
  adminService.getAppConfig.mockResolvedValue({ data: { data: { autoApproveOnboarding: false } } });
  render(<AdminAppConfig />);
  await waitFor(() => expect(toggle()).toBeInTheDocument());
  expect(toggle()).not.toBeChecked();
});

test('reflects the current flag when on', async () => {
  adminService.getAppConfig.mockResolvedValue({ data: { data: { autoApproveOnboarding: true } } });
  render(<AdminAppConfig />);
  await waitFor(() => expect(toggle()).toBeChecked());
});

test('enabling the toggle calls updateAppConfig with autoApproveOnboarding: true', async () => {
  adminService.getAppConfig.mockResolvedValue({ data: { data: { autoApproveOnboarding: false } } });
  adminService.updateAppConfig.mockResolvedValue({ data: { data: { autoApproveOnboarding: true } } });
  render(<AdminAppConfig />);
  await waitFor(() => expect(toggle()).toBeInTheDocument());

  fireEvent.click(toggle());

  await waitFor(() =>
    expect(adminService.updateAppConfig).toHaveBeenCalledWith({ autoApproveOnboarding: true })
  );
  await waitFor(() => expect(toggle()).toBeChecked());
});

test('reverts the toggle when the update fails', async () => {
  adminService.getAppConfig.mockResolvedValue({ data: { data: { autoApproveOnboarding: false } } });
  adminService.updateAppConfig.mockRejectedValue({ response: { data: { message: 'nope' } } });
  render(<AdminAppConfig />);
  await waitFor(() => expect(toggle()).toBeInTheDocument());

  fireEvent.click(toggle());

  // stays off after the failed save
  await waitFor(() => expect(adminService.updateAppConfig).toHaveBeenCalled());
  await waitFor(() => expect(toggle()).not.toBeChecked());
});
