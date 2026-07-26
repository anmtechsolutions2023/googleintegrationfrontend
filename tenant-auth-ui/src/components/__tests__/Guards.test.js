import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ApprovedRoute } from '../Guards';
import { useAuth } from '../../context/AuthContext';

jest.mock('../../context/AuthContext', () => ({ useAuth: jest.fn() }));

const APPROVED = {
  tid: 'tenant-1',
  email: 'user@test.com',
  onboardingStatus: 'APPROVED',
  scopes: ['MASTER_DATA:READ'],
};

// Renders the guard at /secret with stand-ins for every place it can redirect,
// so each test can assert exactly where the user ended up.
const renderAt = (props = {}) =>
  render(
    <MemoryRouter initialEntries={['/secret']}>
      <Routes>
        <Route
          path="/secret"
          element={
            <ApprovedRoute {...props}>
              <div>SECRET</div>
            </ApprovedRoute>
          }
        />
        <Route path="/master-setup" element={<div>WIZARD</div>} />
        <Route path="/dashboard" element={<div>HOME</div>} />
        <Route path="/login" element={<div>LOGIN</div>} />
        <Route path="/onboarding" element={<div>ONBOARDING</div>} />
      </Routes>
    </MemoryRouter>
  );

afterEach(() => jest.clearAllMocks());

describe('ApprovedRoute — existing behaviour', () => {
  test('redirects an unauthenticated visitor to login', () => {
    useAuth.mockReturnValue({ user: null });
    renderAt();
    expect(screen.getByText('LOGIN')).toBeInTheDocument();
  });

  test('redirects a guest to onboarding', () => {
    useAuth.mockReturnValue({ user: { tid: null, onboardingStatus: 'PENDING' } });
    renderAt();
    expect(screen.getByText('ONBOARDING')).toBeInTheDocument();
  });

  test('renders for an approved user', () => {
    useAuth.mockReturnValue({ user: APPROVED });
    renderAt();
    expect(screen.getByText('SECRET')).toBeInTheDocument();
  });
});

describe('ApprovedRoute — first-time setup gate', () => {
  test('redirects a gated user to the setup wizard', () => {
    useAuth.mockReturnValue({ user: { ...APPROVED, setupCompleted: false } });
    renderAt();
    expect(screen.getByText('WIZARD')).toBeInTheDocument();
    expect(screen.queryByText('SECRET')).not.toBeInTheDocument();
  });

  test('allowDuringSetup routes still render for a gated user', () => {
    useAuth.mockReturnValue({ user: { ...APPROVED, setupCompleted: false } });
    renderAt({ allowDuringSetup: true });
    expect(screen.getByText('SECRET')).toBeInTheDocument();
  });

  // ── The backward-compatibility contract ────────────────────────────────────
  test('a token with NO setupCompleted claim is not gated', () => {
    // Every session issued before this feature shipped is in this shape. If the
    // guard treated a missing claim as "incomplete", deploying would bounce
    // every logged-in user into the wizard.
    useAuth.mockReturnValue({ user: APPROVED });
    renderAt();
    expect(screen.getByText('SECRET')).toBeInTheDocument();
  });

  test('setupCompleted: true is not gated', () => {
    useAuth.mockReturnValue({ user: { ...APPROVED, setupCompleted: true } });
    renderAt();
    expect(screen.getByText('SECRET')).toBeInTheDocument();
  });

  test('super admins are exempt even when their tenant is incomplete', () => {
    useAuth.mockReturnValue({
      user: { ...APPROVED, scopes: ['TENANT:SUPER_ADMIN'], setupCompleted: false },
    });
    renderAt();
    expect(screen.getByText('SECRET')).toBeInTheDocument();
  });

  test('the guest check still wins over the setup gate', () => {
    // A guest has no tenant to set up; onboarding is the right destination.
    useAuth.mockReturnValue({
      user: { tid: null, onboardingStatus: 'PENDING', setupCompleted: false },
    });
    renderAt();
    expect(screen.getByText('ONBOARDING')).toBeInTheDocument();
  });
});
