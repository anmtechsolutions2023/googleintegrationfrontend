import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Forbidden from '../pages/Forbidden';
import { hasScope } from '../utils/permissions';
import { ROUTES } from '../constants/routes';

export const ProtectedRoute = ({ children }) => {
  const { user } = useAuth();
  const location = useLocation();
  return user ? (
    children
  ) : (
    <Navigate to={ROUTES.LOGIN} state={{ from: location }} replace />
  );
};

export const ScopeGuard = ({ requiredScopes, children }) => {
  const { user } = useAuth();
  const hasAccess = hasScope(user, requiredScopes);
  return hasAccess ? children : <Forbidden />;
};
