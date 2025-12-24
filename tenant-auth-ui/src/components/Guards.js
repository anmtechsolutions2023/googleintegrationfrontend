import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Forbidden from '../pages/Forbidden'

export const ProtectedRoute = ({ children }) => {
  const { user } = useAuth()
  const location = useLocation()
  return user ? (
    children
  ) : (
    <Navigate to="/login" state={{ from: location }} replace />
  )
}

export const ScopeGuard = ({ requiredScopes, children }) => {
  const { user } = useAuth()
  const hasAccess = requiredScopes.some((s) => user?.scopes?.includes(s))
  return hasAccess ? children : <Forbidden />
}
