import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'

import { AuthProvider, useAuth } from './context/AuthContext'
import { ProtectedRoute, ScopeGuard } from './components/Guards'
import Navbar from './components/Navbar'
import LoadingSpinner from './components/LoadingSpinner'

import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Forbidden from './pages/Forbidden'
import AdminPage from './pages/AdminPage'
import AuditLogs from './pages/AuditLogs'

const AppRoutes = () => {
  const { loading, user } = useAuth()
  if (loading) return <LoadingSpinner />

  return (
    <>
      {user && <Navbar />}
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <ScopeGuard requiredScopes={['TENANT:ADMIN']}>
                <AdminPage />
              </ScopeGuard>
            </ProtectedRoute>
          }
        />
        <Route path="/forbidden" element={<Forbidden />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        // Open access route - No guards applied
        <Route path="/audit" element={<AuditLogs />} />
      </Routes>
    </>
  )
}

const App = () => (
  <GoogleOAuthProvider clientId={process.env.REACT_APP_GOOGLE_CLIENT_ID}>
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
        <ToastContainer position="bottom-right" autoClose={3000} />
      </BrowserRouter>
    </AuthProvider>
  </GoogleOAuthProvider>
)

export default App
