import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Forbidden from '../pages/Forbidden';
import { hasScope, isSetupPending } from '../utils/permissions';
import { ROUTES } from '../constants/routes';
import { SCOPES } from '../constants/scopes';

// Existing: redirect to login if not authenticated
export const ProtectedRoute = ({ children }) => {
  const { user } = useAuth();
  const location = useLocation();
  return user ? (
    children
  ) : (
    <Navigate to={ROUTES.LOGIN} state={{ from: location }} replace />
  );
};

// Existing: render Forbidden if user lacks any required scope
export const ScopeGuard = ({ requiredScopes, children }) => {
  const { user } = useAuth();
  const hasAccess = hasScope(user, requiredScopes);
  return hasAccess ? children : <Forbidden />;
};

// New: only for provisioned (approved) users — guests are bounced to /onboarding.
//
// Also enforces the first-time tenancy setup gate. Until the tenant completes
// the wizard, every route bounces to /master-setup except the three that opt out
// via `allowDuringSetup` (Home, Audit Logs, and the wizard itself). Gating here
// rather than per-route means any route added later inherits the block by
// default — the safe direction to fail.
export const ApprovedRoute = ({ children, allowDuringSetup = false }) => {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    return <Navigate to={ROUTES.LOGIN} state={{ from: location }} replace />;
  }

  if (!user.tid || user.onboardingStatus !== 'APPROVED') {
    return <Navigate to={ROUTES.ONBOARDING} replace />;
  }

  if (!allowDuringSetup && isSetupPending(user)) {
    return <Navigate to={ROUTES.MASTER_SETUP} replace />;
  }

  return children;
};

// New: only for guest users with a pending/rejected onboarding request
// Approved users are redirected to dashboard so they don't land here
export const GuestRoute = ({ children }) => {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    return <Navigate to={ROUTES.LOGIN} state={{ from: location }} replace />;
  }

  if (user.tid && user.onboardingStatus === 'APPROVED') {
    return <Navigate to={ROUTES.DASHBOARD} replace />;
  }

  // Must have guest:explore scope to view onboarding page
  if (!hasScope(user, [SCOPES.GUEST_EXPLORE])) {
    return <Navigate to={ROUTES.LOGIN} replace />;
  }

  return children;
};
