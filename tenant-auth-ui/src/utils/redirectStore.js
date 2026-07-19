// Persists the page a user was on when their session expired, so we can
// return them there after re-login. sessionStorage survives the hard page
// reload the axios interceptor triggers, but auto-clears on tab close.
import { APP_CONFIG } from '../constants';
import { ROUTES } from '../constants/routes';

const KEY = APP_CONFIG.POST_LOGIN_REDIRECT_KEY;

// Paths that are pointless (or loop) to restore to after login
const NON_RESTORABLE = [
  ROUTES.LOGIN,
  ROUTES.AUTH_CALLBACK,
  ROUTES.ONBOARDING,
  ROUTES.FORBIDDEN,
  ROUTES.NOT_FOUND,
];

// Only allow same-origin relative paths (must start with a single "/").
// Rejects absolute URLs and protocol-relative "//host" open-redirect attempts.
const isSafeRestorablePath = (path) => {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) {
    return false;
  }
  const pathname = path.split('?')[0];
  return !NON_RESTORABLE.includes(pathname);
};

export const saveRedirect = (path) => {
  try {
    if (isSafeRestorablePath(path)) {
      sessionStorage.setItem(KEY, path);
    }
  } catch {
    // sessionStorage may be unavailable (private mode / disabled) — ignore
  }
};

// Read without clearing, so a refresh/remount of the login page before the
// user actually logs in still resolves the same destination. The value is
// removed only via clearRedirect() after a successful login.
export const peekRedirect = () => {
  try {
    const path = sessionStorage.getItem(KEY);
    return isSafeRestorablePath(path) ? path : null;
  } catch {
    return null;
  }
};

// Call after a successful login so a stale value never bounces a later visit.
export const clearRedirect = () => {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
};
