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
import MasterDataSetup from './pages/MasterDataSetup';
import ReportsPage from './pages/ReportsPage';
import OnboardingPage from './pages/OnboardingPage';
import AdminDashboard from './pages/admin/AdminDashboard';

// Front Desk (POS)
import FrontDeskLayout from './components/frontdesk/FrontDeskLayout';
import FrontDeskDashboard from './pages/frontdesk/FrontDeskDashboard';
import Billing from './pages/frontdesk/Billing';
import Tables from './pages/frontdesk/Tables';
import Kitchen from './pages/frontdesk/Kitchen';
import MenuMaster from './pages/frontdesk/MenuMaster';
import FoodTypes from './pages/frontdesk/FoodTypes';
import Channels from './pages/frontdesk/Channels';
import Variants from './pages/frontdesk/Variants';
import Floors from './pages/frontdesk/Floors';
import Staff from './pages/frontdesk/Staff';
import Expenses from './pages/frontdesk/Expenses';
import Customers from './pages/frontdesk/Customers';
import Feedback from './pages/frontdesk/Feedback';
import Tokens from './pages/frontdesk/Tokens';
import OnlineOrders from './pages/frontdesk/OnlineOrders';
import Tracking from './pages/frontdesk/Tracking';
import Inventory from './pages/frontdesk/Inventory';
import Reports from './pages/frontdesk/Reports'
import Ledger from './pages/frontdesk/Ledger';
import Finance from './pages/frontdesk/Finance';
import CashSessions from './pages/frontdesk/CashSessions';
import Assets from './pages/frontdesk/Assets';
import AssetCategories from './pages/frontdesk/AssetCategories';
import ExpenseCategories from './pages/frontdesk/ExpenseCategories';
import AccessControl from './pages/frontdesk/AccessControl';

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

        {/* Audit logs — provisioned users with AUDIT:READ (or IAM admins).
            allowDuringSetup: one of the three screens reachable before the
            first-time setup wizard is finished. */}
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
        {/* Home — allowDuringSetup: reachable before the setup wizard is done. */}
        <Route
          path={ROUTES.DASHBOARD}
          element={
            <ApprovedRoute allowDuringSetup>
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

        {/* First-time master-data setup wizard (tenant admins).
            allowDuringSetup: this is the destination the gate redirects to, so
            it must never be gated itself or the redirect would loop. */}
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

        {/* Front Desk (POS) */}
        <Route
          path={`${ROUTES.FRONTDESK}/*`}
          element={
            <ApprovedRoute>
              <ScopeGuard
                requiredScopes={[
                  SCOPES.POS_ORDER_READ,
                  SCOPES.POS_CONFIG_READ,
                  SCOPES.POS_KITCHEN_READ,
                  SCOPES.POS_BILLING_READ,
                  SCOPES.POS_CRM_READ,
                  SCOPES.POS_OPS_READ,
                  SCOPES.POS_REPORTS_READ,
                  SCOPES.TENANT_ADMIN,
                ]}
              >
                <FrontDeskLayout />
              </ScopeGuard>
            </ApprovedRoute>
          }
        >
          <Route index element={<FrontDeskDashboard />} />
          <Route path="billing"   element={<ScopeGuard requiredScopes={[SCOPES.POS_ORDER_READ,   SCOPES.TENANT_ADMIN]}><Billing /></ScopeGuard>} />
          <Route path="tables"    element={<ScopeGuard requiredScopes={[SCOPES.POS_ORDER_READ,   SCOPES.TENANT_ADMIN]}><Tables /></ScopeGuard>} />
          <Route path="kitchen"   element={<ScopeGuard requiredScopes={[SCOPES.POS_KITCHEN_READ, SCOPES.TENANT_ADMIN]}><Kitchen /></ScopeGuard>} />
          <Route path="tokens"    element={<ScopeGuard requiredScopes={[SCOPES.POS_OPS_READ,     SCOPES.TENANT_ADMIN]}><Tokens /></ScopeGuard>} />
          <Route path="online"    element={<ScopeGuard requiredScopes={[SCOPES.POS_OPS_READ,     SCOPES.TENANT_ADMIN]}><OnlineOrders /></ScopeGuard>} />
          <Route path="menu"       element={<ScopeGuard requiredScopes={[SCOPES.POS_CONFIG_READ,  SCOPES.TENANT_ADMIN]}><MenuMaster /></ScopeGuard>} />
          <Route path="food-types" element={<ScopeGuard requiredScopes={[SCOPES.POS_CONFIG_READ,  SCOPES.TENANT_ADMIN]}><FoodTypes /></ScopeGuard>} />
          <Route path="channels"  element={<ScopeGuard requiredScopes={[SCOPES.POS_CONFIG_READ,  SCOPES.TENANT_ADMIN]}><Channels /></ScopeGuard>} />
          <Route path="variants"  element={<ScopeGuard requiredScopes={[SCOPES.POS_CONFIG_READ,  SCOPES.TENANT_ADMIN]}><Variants /></ScopeGuard>} />
          <Route path="floors"    element={<ScopeGuard requiredScopes={[SCOPES.POS_CONFIG_READ,  SCOPES.TENANT_ADMIN]}><Floors /></ScopeGuard>} />
          <Route path="staff"     element={<ScopeGuard requiredScopes={[SCOPES.POS_CONFIG_READ,  SCOPES.TENANT_ADMIN]}><Staff /></ScopeGuard>} />
          <Route path="expenses"  element={<ScopeGuard requiredScopes={[SCOPES.POS_OPS_READ,     SCOPES.TENANT_ADMIN]}><Expenses /></ScopeGuard>} />
          <Route path="customers"      element={<ScopeGuard requiredScopes={[SCOPES.POS_CRM_READ,     SCOPES.TENANT_ADMIN]}><Customers /></ScopeGuard>} />
          <Route path="feedback"       element={<ScopeGuard requiredScopes={[SCOPES.POS_CRM_READ,     SCOPES.TENANT_ADMIN]}><Feedback /></ScopeGuard>} />
          <Route path="tracking"       element={<ScopeGuard requiredScopes={[SCOPES.POS_OPS_READ,     SCOPES.TENANT_ADMIN]}><Tracking /></ScopeGuard>} />
          <Route path="inventory"      element={<ScopeGuard requiredScopes={[SCOPES.INVENTORY_READ,   SCOPES.TENANT_ADMIN]}><Inventory /></ScopeGuard>} />
          <Route path="reports"        element={<ScopeGuard requiredScopes={[SCOPES.POS_REPORTS_READ, SCOPES.TENANT_ADMIN]}><Reports /></ScopeGuard>} />
          {/* Accounting ledger — gated on TRANSACTIONS scopes: a ledger
              document IS the transaction record. */}
          <Route path="ledger"         element={<ScopeGuard requiredScopes={[SCOPES.TRANSACTIONS_READ, SCOPES.TRANSACTIONS_WRITE, SCOPES.TENANT_ADMIN]}><Ledger /></ScopeGuard>} />
          {/* Financial reporting reads the same documents as the ledger, so it
              shares the ledger's scopes rather than the operational POS ones. */}
          <Route path="finance"        element={<ScopeGuard requiredScopes={[SCOPES.TRANSACTIONS_READ, SCOPES.TRANSACTIONS_WRITE, SCOPES.TENANT_ADMIN]}><Finance /></ScopeGuard>} />
          {/* The drawer belongs to whoever takes the money. */}
          <Route path="cash-sessions"  element={<ScopeGuard requiredScopes={[SCOPES.POS_BILLING_READ, SCOPES.POS_BILLING_WRITE, SCOPES.TENANT_ADMIN]}><CashSessions /></ScopeGuard>} />
          <Route path="assets"         element={<ScopeGuard requiredScopes={[SCOPES.ASSET_READ, SCOPES.ASSET_WRITE, SCOPES.TENANT_ADMIN]}><Assets /></ScopeGuard>} />
          <Route path="asset-categories"   element={<ScopeGuard requiredScopes={[SCOPES.ASSET_READ, SCOPES.ASSET_WRITE, SCOPES.TENANT_ADMIN]}><AssetCategories /></ScopeGuard>} />
          {/* Reading categories is open to anyone who can raise an expense —
              they have to pick one. Writing is gated inside the page. */}
          <Route path="expense-categories" element={<ScopeGuard requiredScopes={[SCOPES.POS_OPS_READ, SCOPES.POS_OPS_WRITE, SCOPES.EXPENSE_APPROVE, SCOPES.TENANT_ADMIN]}><ExpenseCategories /></ScopeGuard>} />
          <Route path="access-control" element={<ScopeGuard requiredScopes={[SCOPES.TENANT_ADMIN]}><AccessControl /></ScopeGuard>} />
        </Route>

        {/* 404 — wrapped so an unrecognised URL cannot be used to slip past the
            setup gate. Unauthenticated visitors still land on Login as before. */}
        <Route
          path="*"
          element={
            <ApprovedRoute>
              <NotFound />
            </ApprovedRoute>
          }
        />
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
