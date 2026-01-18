import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Forbidden from '../pages/Forbidden'
import { SCOPES } from '../constants/scopes'

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
  const hasRequiredScope = (userObj, reqScopes) => {
    const scopes = userObj?.scopes || []
    // Super admin has access to everything
    if (scopes.includes(SCOPES.TENANT_SUPER_ADMIN)) return true
    if (!reqScopes || reqScopes.length === 0) return true
    return reqScopes.some((s) => scopes.includes(s))
  }

  const hasAccess = hasRequiredScope(user, requiredScopes)
  return hasAccess ? children : <Forbidden />
}
