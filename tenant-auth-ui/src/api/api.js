import axios from 'axios';
import Cookies from 'js-cookie';
import { API_BASE_URL, AUTH } from '../config/config';
import { HTTP_STATUS, APP_CONFIG } from '../constants';
import { ROUTES } from '../constants/routes';
import { saveRedirect } from '../utils/redirectStore';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: APP_CONFIG.API.REQUEST_TIMEOUT_MS,
});

api.interceptors.request.use((config) => {
  const token = Cookies.get(APP_CONFIG.COOKIE_NAME);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// The server checks a member's access on every request. When it has changed
// since sign-in — a role edited, the Admin switch turned on or off — the
// response carries a re-signed token with the new scopes (same expiry). It is
// handed to AuthContext, which stores it and re-renders, so the menu and the
// buttons catch up without anybody signing out. The header name matches the
// backend's liveAccess.REFRESH_HEADER.
export const ACCESS_TOKEN_HEADER = 'x-access-token';
export const TOKEN_REFRESHED_EVENT = 'auth:token-refreshed';

const passOnRefreshedToken = (response) => {
  const fresh = response?.headers?.[ACCESS_TOKEN_HEADER];
  if (fresh && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(TOKEN_REFRESHED_EVENT, { detail: fresh }));
  }
};

api.interceptors.response.use(
  (res) => {
    passOnRefreshedToken(res);
    return res;
  },
  (err) => {
    // A refusal can follow a change of access too (the scope that was just
    // withdrawn is the one this call needed), so the fresh token still counts.
    passOnRefreshedToken(err.response);

    // Check if the error is 401 AND it's NOT the login request
    const isLoginRequest = err.config.url.includes(AUTH.LOGIN);

    if (err.response?.status === HTTP_STATUS.UNAUTHORIZED && !isLoginRequest) {
      Cookies.remove(APP_CONFIG.COOKIE_NAME);
      // Remember the current page so re-login can return the user here.
      // The hard redirect below wipes React Router state, so we persist it.
      saveRedirect(window.location.pathname + window.location.search);
      // Only redirect if it's an expired session, not a failed login attempt
      window.location.href = `${ROUTES.LOGIN}?session=expired`;
    }

    // The tenancy setup gate. Matched on the explicit `code` rather than the
    // status alone, so ordinary scope 403s keep their existing behaviour.
    // Covers the stale-tab case: a session opened before the gate applied, or
    // one gated mid-session by a tenant switch.
    if (
      err.response?.status === HTTP_STATUS.FORBIDDEN &&
      err.response?.data?.code === 'TENANT_SETUP_REQUIRED' &&
      window.location.pathname !== ROUTES.MASTER_SETUP
    ) {
      window.location.href = ROUTES.MASTER_SETUP;
    }

    return Promise.reject(err);
  }
);

export default api;
