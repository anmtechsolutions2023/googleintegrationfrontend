import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import { AuthProvider, useAuth } from './context/AuthContext';
import { SCOPES, APP_CONFIG } from './constants';
import { ROUTES } from './constants/routes';
import { ScopeGuard, ApprovedRoute, GuestRoute } from './components/Guards';
import Navbar from './components/Navbar';
import LoadingSpinner from './components/LoadingSpinner';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Forbidden from './pages/Forbidden';
import NotFound from './pages/NotFound';
import AdminPage from './pages/AdminPage';
import AuditLogs from './pages/AuditLogs';
import MasterDataSetup from './pages/MasterDataSetup';
import OnboardingPage from './pages/OnboardingPage';
import AdminDashboard from './pages/admin/AdminDashboard';
import TokenDisplay from './pages/frontdesk/TokenDisplay';
import DineApp from './pages/dine/DineApp';

// Every tenant screen lives in one of seven workspaces — see config/workspaces.js.
import WorkspaceLayout from './components/workspace/WorkspaceLayout';
import { workspaceRoutes, movedRoutes } from './components/workspace/workspaceRoutes';
import { LegacyRedirect, HomeRedirect } from './components/workspace/WorkspaceRedirects';

const AppRoutes = () => {
  const { loading, user } = useAuth();
  const { pathname } = useLocation();
  const isCustomerDisplay = pathname.startsWith(`${ROUTES.FRONTDESK}/tokens/display`);
  // A guest's phone at a QR table: public, and never shows staff navigation —
  // even when the phone happens to hold a staff session.
  const isDinerPage = pathname.startsWith('/t/');
  if (loading) return <LoadingSpinner />;

  return (
    <>
      {/* The customer token board is a sign on a second monitor, not a page:
          app navigation on it is something a customer could click, and it eats
          the top of a display that is meant to be read from across a room. */}
      {user && !isCustomerDisplay && !isDinerPage && <Navbar />}
      <Routes>
        {/* Public */}
        <Route path={ROUTES.LOGIN} element={<Login />} />
        <Route path={ROUTES.FORBIDDEN} element={<Forbidden />} />
        {/* QR table ordering — the guest's phone. Public: no staff login, no
            guards. Everything it can do is decided server-side from the token. */}
        <Route path={ROUTES.DINE} element={<DineApp />} />
        <Route path={ROUTES.HOME} element={<Navigate to={ROUTES.DASHBOARD} replace />} />

        {/* Guest-only: unprovisioned users waiting for approval */}
        <Route path={ROUTES.ONBOARDING} element={<GuestRoute><OnboardingPage /></GuestRoute>} />

        {/* Home. Mid-setup it is the home page — one of the few screens the
            setup gate leaves reachable; after that it forwards to the first
            workspace this person can open. */}
        <Route
          path={ROUTES.DASHBOARD}
          element={<ApprovedRoute allowDuringSetup><HomeRedirect fallback={<Dashboard />} /></ApprovedRoute>}
        />

        {/* Audit logs during first-time setup, before the workspaces open up.
            After setup the same page is Admin › Audit Logs. */}
        <Route
          path={ROUTES.AUDIT}
          element={
            <ApprovedRoute allowDuringSetup>
              <ScopeGuard requiredScopes={[SCOPES.AUDIT_READ, SCOPES.ADMIN_ACCESS]}>
                <AuditLogs />
              </ScopeGuard>
            </ApprovedRoute>
          }
        />

        {/* First-time setup wizard (tenant admins). allowDuringSetup: this is
            where the gate sends people, so it must never be gated itself. */}
        <Route
          path={ROUTES.MASTER_SETUP}
          element={
            <ApprovedRoute allowDuringSetup>
              <ScopeGuard requiredScopes={[SCOPES.TENANT_ADMIN, SCOPES.TENANT_SUPER_ADMIN]}>
                <MasterDataSetup />
              </ScopeGuard>
            </ApprovedRoute>
          }
        />

        {/* Legacy admin page (TENANT_ADMIN scope) — unchanged */}
        <Route
          path={ROUTES.ADMIN_SETTINGS}
          element={<ApprovedRoute><ScopeGuard requiredScopes={[SCOPES.TENANT_ADMIN]}><AdminPage /></ScopeGuard></ApprovedRoute>}
        />

        {/* A tenancy's people moved into Admin › People & Access. Declared ahead
            of /admin/* so they resolve before the super-admin guard below. */}
        <Route path={`${ROUTES.ADMIN}/users`} element={<Navigate to={ROUTES.ACCESS_CONTROL} replace />} />
        <Route path={`${ROUTES.ADMIN}/roles`} element={<Navigate to={ROUTES.ACCESS_CONTROL} replace />} />

        {/* The platform console: onboarding requests, the global feature
            catalogue, cross-tenant users, system configuration. Super admins
            only — none of it can be narrowed to one tenancy, so it is not a
            workspace. */}
        <Route
          path={`${ROUTES.ADMIN}/*`}
          element={<ApprovedRoute><ScopeGuard requiredScopes={[SCOPES.TENANT_SUPER_ADMIN]}><AdminDashboard /></ScopeGuard></ApprovedRoute>}
        />

        {/* Customer-facing token board: a sign on a second monitor, so it sits
            outside the workspace shell — no rail, nothing a customer could press. */}
        <Route
          path={`${ROUTES.FRONTDESK}/tokens/display`}
          element={
            <ApprovedRoute>
              <ScopeGuard requiredScopes={[SCOPES.POS_OPS_READ, SCOPES.TENANT_ADMIN]}>
                <TokenDisplay />
              </ScopeGuard>
            </ApprovedRoute>
          }
        />

        {/* The till and the seven workspaces. Routes, guards and tabs all come
            from config/workspaces.js. */}
        <Route element={<ApprovedRoute><WorkspaceLayout /></ApprovedRoute>}>
          {workspaceRoutes()}
        </Route>

        {/* Old addresses — /frontdesk/*, /master/*, /reports, and moved
            workspace screens such as /service/floor/order — forward to where
            each screen lives now, keeping ids and query strings. */}
        <Route path={ROUTES.FRONTDESK} element={<ApprovedRoute><LegacyRedirect /></ApprovedRoute>} />
        <Route path={`${ROUTES.FRONTDESK}/*`} element={<ApprovedRoute><LegacyRedirect /></ApprovedRoute>} />
        <Route path="/master" element={<ApprovedRoute><LegacyRedirect /></ApprovedRoute>} />
        <Route path="/master/*" element={<ApprovedRoute><LegacyRedirect /></ApprovedRoute>} />
        <Route path="/reports" element={<ApprovedRoute><LegacyRedirect /></ApprovedRoute>} />
        {movedRoutes((el) => <ApprovedRoute>{el}</ApprovedRoute>)}

        {/* 404 — wrapped so an unrecognised URL cannot be used to slip past the
            setup gate. Unauthenticated visitors still land on Login as before. */}
        <Route path="*" element={<ApprovedRoute><NotFound /></ApprovedRoute>} />
      </Routes>
    </>
  );
};

const App = () => (
  <AuthProvider>
    <BrowserRouter>
      <AppRoutes />
      <ToastContainer
        position={APP_CONFIG.TOAST.POSITION}
        autoClose={APP_CONFIG.TOAST.DEFAULT_DURATION_MS}
      />
    </BrowserRouter>
  </AuthProvider>
);

export default App;
