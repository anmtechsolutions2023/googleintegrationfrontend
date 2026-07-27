import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Login from '../Login';
import { useAuth } from '../../context/AuthContext';

// Capture navigation targets without a real Router.
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ state: null }),
}));

jest.mock('../../context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

// GoogleLogin: render a button that fires onSuccess with a fake credential so we
// can drive the post-login redirect logic directly.
jest.mock('@react-oauth/google', () => ({
  GoogleLogin: ({ onSuccess }) => (
    <button onClick={() => onSuccess({ credential: 'fake-google-token' })}>
      Google Sign In
    </button>
  ),
}));

const login = jest.fn();
const renderAndSignIn = () => {
  useAuth.mockReturnValue({ login });
  render(<Login />);
  fireEvent.click(screen.getByText('Google Sign In'));
};

afterEach(() => jest.clearAllMocks());

test('sends a setup-pending approved user to the setup wizard', async () => {
  login.mockResolvedValue({
    tid: 'tenant-1',
    onboardingStatus: 'APPROVED',
    setupCompleted: false, // fresh auto-approved tenant
    scopes: ['TENANT:ADMIN'],
  });
  renderAndSignIn();
  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/master-setup', { replace: true }));
});

test('sends an already-set-up approved user to the dashboard', async () => {
  login.mockResolvedValue({
    tid: 'tenant-1',
    onboardingStatus: 'APPROVED',
    setupCompleted: true,
    scopes: ['TENANT:ADMIN'],
  });
  renderAndSignIn();
  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true }));
});

test('sends an unprovisioned (guest) user to onboarding', async () => {
  login.mockResolvedValue({ onboardingStatus: 'PENDING' });
  renderAndSignIn();
  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/onboarding', { replace: true }));
});
