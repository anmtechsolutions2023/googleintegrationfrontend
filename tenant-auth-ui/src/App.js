import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import { AuthProvider, useAuth } from './context/AuthContext';
import { SCOPES, APP_CONFIG } from './constants';
import { ROUTES } from './constants/routes';
import { THIRD_PARTY } from './config/config';
import { ProtectedRoute, ScopeGuard } from './components/Guards';
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

const AppRoutes = () => {
  const { loading, user } = useAuth();
  if (loading) return <LoadingSpinner />;

  return (
    <>
      {user && <Navbar />}
      <Routes>
        <Route path={ROUTES.LOGIN} element={<Login />} />
        <Route
          path={ROUTES.DASHBOARD}
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path={ROUTES.ADMIN}
          element={
            <ProtectedRoute>
              <ScopeGuard requiredScopes={[SCOPES.TENANT_ADMIN]}>
                <AdminPage />
              </ScopeGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path={ROUTES.REPORTS}
          element={
            <ProtectedRoute>
              <ScopeGuard
                requiredScopes={[
                  SCOPES.REPORTS_READ,
                  SCOPES.REPORTS_WRITE,
                  SCOPES.TENANT_ADMIN,
                ]}
              >
                <ReportsPage />
              </ScopeGuard>
            </ProtectedRoute>
          }
        />
        <Route path={ROUTES.FORBIDDEN} element={<Forbidden />} />
        <Route
          path={ROUTES.HOME}
          element={<Navigate to={ROUTES.DASHBOARD} replace />}
        />
        {/* Open access route - No guards applied */}
        <Route path={ROUTES.AUDIT} element={<AuditLogs />} />

        {/* Master Data Module - Nested Routes */}
        <Route
          path={ROUTES.MASTER}
          element={
            <ProtectedRoute>
              <MasterDataLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<MasterDataIndex />} />
          <Route path=":moduleKey" element={<GenericCrudPage />} />
        </Route>

        {/* 404 catch-all route */}
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
