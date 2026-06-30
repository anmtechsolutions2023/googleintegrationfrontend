import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import { AuthProvider, useAuth } from './context/AuthContext';
import { SCOPES, APP_CONFIG } from './constants';
import { ROUTES } from './constants/routes';
import { THIRD_PARTY } from './config/config';
import {
  ProtectedRoute,
  ScopeGuard,
  ApprovedRoute,
  GuestRoute,
} from './components/Guards';
import Navbar from './components/Navbar';
import LoadingSpinner from './components/LoadingSpinner';
import {
  MasterDataLayout,
  MasterDataIndex,
  GenericCrudPage,
} from './components/MasterData';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Forbidden from './pages/Forbidden';
import NotFound from './pages/NotFound';
import AdminPage from './pages/AdminPage';
import AuditLogs from './pages/AuditLogs';
import ReportsPage from './pages/ReportsPage';
import OnboardingPage from './pages/OnboardingPage';
import AdminDashboard from './pages/admin/AdminDashboard';

const AppRoutes = () => {
  const { loading, user } = useAuth();
  if (loading) return <LoadingSpinner />;

  return (
    <>
      {user && <Navbar />}
      <Routes>
        {/* Public */}
        <Route path={ROUTES.LOGIN} element={<Login />} />
        <Route path={ROUTES.FORBIDDEN} element={<Forbidden />} />
        <Route path={ROUTES.HOME} element={<Navigate to={ROUTES.DASHBOARD} replace />} />

        {/* Open access - no auth guard */}
        <Route path={ROUTES.AUDIT} element={<AuditLogs />} />

        {/* Guest-only: unprovisioned users waiting for approval */}
        <Route
          path={ROUTES.ONBOARDING}
          element={
            <GuestRoute>
              <OnboardingPage />
            </GuestRoute>
          }
        />

        {/* ── Approved (provisioned) users only ── */}
        <Route
          path={ROUTES.DASHBOARD}
          element={
            <ApprovedRoute>
              <Dashboard />
            </ApprovedRoute>
          }
        />

        <Route
          path={ROUTES.REPORTS}
          element={
            <ApprovedRoute>
              <ScopeGuard
                requiredScopes={[
                  SCOPES.REPORTS_READ,
                  SCOPES.REPORTS_WRITE,
                  SCOPES.TENANT_ADMIN,
                ]}
              >
                <ReportsPage />
              </ScopeGuard>
            </ApprovedRoute>
          }
        />

        {/* Legacy admin page (TENANT_ADMIN scope) — unchanged */}
        <Route
          path={ROUTES.ADMIN_SETTINGS}
          element={
            <ApprovedRoute>
              <ScopeGuard requiredScopes={[SCOPES.TENANT_ADMIN]}>
                <AdminPage />
              </ScopeGuard>
            </ApprovedRoute>
          }
        />

        {/* New IAM admin section (admin:access scope) — nested under /admin/* */}
        <Route
          path={`${ROUTES.ADMIN}/*`}
          element={
            <ApprovedRoute>
              <ScopeGuard requiredScopes={[SCOPES.ADMIN_ACCESS]}>
                <AdminDashboard />
              </ScopeGuard>
            </ApprovedRoute>
          }
        />

        {/* Master Data Module */}
        <Route
          path={ROUTES.MASTER}
          element={
            <ApprovedRoute>
              <MasterDataLayout />
            </ApprovedRoute>
          }
        >
          <Route index element={<MasterDataIndex />} />
          <Route path=":moduleKey" element={<GenericCrudPage />} />
        </Route>

        {/* 404 */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
};

const App = () => (
  <GoogleOAuthProvider clientId={THIRD_PARTY.GOOGLE_CLIENT_ID}>
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
        <ToastContainer
          position={APP_CONFIG.TOAST.POSITION}
          autoClose={APP_CONFIG.TOAST.DEFAULT_DURATION_MS}
        />
      </BrowserRouter>
    </AuthProvider>
  </GoogleOAuthProvider>
);

export default App;
