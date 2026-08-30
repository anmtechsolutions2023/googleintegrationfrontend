import React, { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-toastify';
import {
  MESSAGES,
  HTTP_STATUS,
  STRINGS,
  APP_CONFIG,
  ERROR_CODES,
} from '../constants';
import { ROUTES } from '../constants/routes';
import { peekRedirect, clearRedirect } from '../utils/redirectStore';
import { isSetupPending } from '../utils/permissions';
import './login.css';

const Login = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Resolve where to send the user after login, evaluated once on mount:
  //  1. React Router state (client-side guard redirect)
  //  2. sessionStorage (session-expiry hard redirect from the API interceptor)
  //  3. dashboard fallback
  // peekRedirect() does NOT clear, so refreshing the login page before logging
  // in still resolves the same destination; it's cleared after login succeeds.
  const [from] = useState(
    () => location.state?.from?.pathname || peekRedirect() || ROUTES.DASHBOARD
  );

  const onSuccess = async (res) => {
    try {
      const payload = await login(res.credential);

      if (payload) {
        // Login succeeded — the saved redirect (if any) has served its purpose.
        clearRedirect();
        if (payload.onboardingStatus !== 'APPROVED') {
          // Unprovisioned user — send to onboarding holding page
          toast.info('Your access request is pending review.');
          navigate(ROUTES.ONBOARDING, { replace: true });
        } else if (isSetupPending(payload)) {
          // First-time tenant admin (e.g. just auto-approved into a fresh tenant):
          // land them on the setup wizard so they focus on setting up their
          // tenancy, not on Home (which is reachable during setup but not the goal).
          toast.success(MESSAGES.success.welcome);
          navigate(ROUTES.MASTER_SETUP, { replace: true });
        } else {
          toast.success(MESSAGES.success.welcome);
          // Don't bounce approved users back to /onboarding if that's where they came from
          const destination =
            from === ROUTES.ONBOARDING ? ROUTES.DASHBOARD : from;
          navigate(destination, { replace: true });
        }
      }
    } catch (error) {
      const backendData = error.response?.data;

      if (
        backendData?.status === HTTP_STATUS.UNAUTHORIZED ||
        error.response?.status === HTTP_STATUS.UNAUTHORIZED
      ) {
        toast.error(MESSAGES.error[ERROR_CODES.USER_NOT_EXIST], {
          position: APP_CONFIG.TOAST.ERROR_POSITION,
          autoClose: APP_CONFIG.TOAST.ERROR_DURATION_MS,
          theme: APP_CONFIG.TOAST.THEME,
        });
      } else if (error.response?.status === HTTP_STATUS.FORBIDDEN) {
        toast.error(MESSAGES.error[ERROR_CODES.USER_NOT_FOUND_TENANT]);
      } else {
        toast.error(MESSAGES.error[ERROR_CODES.GENERIC_ERROR]);
      }
    }
  };

  const s = STRINGS.pages.login;

  return (
    <div className="login-page">
      {/* The panel is #1a1a2e — the colour the POS sidebar becomes a moment
          later — so signing in reads as entering the app, not passing a gate. */}
      <div className="login-brand">
        <div className="login-mark">
          {/* Placeholder mark. STRINGS.app.logo is an office building, which is
              the wrong idea for a restaurant and weak at this size. */}
          <svg viewBox="0 0 32 32" width="30" height="30" role="img" aria-label={STRINGS.app.name}>
            <path d="M4 23h24" stroke="#4fc3f7" strokeWidth="2.2" strokeLinecap="round" fill="none" />
            <path d="M6.5 22a9.5 9.5 0 0 1 19 0" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" />
            <circle cx="16" cy="8.2" r="1.9" fill="#4fc3f7" />
          </svg>
          <span>{STRINGS.app.name}</span>
        </div>

        <div className="login-copy">
          <h2 className="login-headline">{s.headline}</h2>
          <p className="login-blurb">{s.blurb}</p>
        </div>

        <div className="login-bottom">
          <div className="login-tags">
            {s.capabilities.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
          <p className="login-foot">{s.access}</p>
        </div>
      </div>

      <div className="login-main">
        <div className="login-card">
          <div className="login-head">
            <h1>{s.title}</h1>
            <p className="login-sub">{s.subtitle}</p>
          </div>

          {/* Unchanged: Google renders and owns this button. */}
          <div className="login-btn">
            <GoogleLogin
              onSuccess={onSuccess}
              onError={() =>
                toast.error(MESSAGES.error[ERROR_CODES.GOOGLE_SIGNIN_FAILED])
              }
              useOneTap={false}
            />
          </div>

          <p className="login-note">{s.firstTime}</p>
        </div>
      </div>
    </div>
  );
};

export default Login;
