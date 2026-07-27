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

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h2 style={styles.title}>{STRINGS.pages.login.title}</h2>
        <p style={styles.subtitle}>{STRINGS.pages.login.subtitle}</p>
        <div style={styles.btnWrapper}>
          <GoogleLogin
            onSuccess={onSuccess}
            onError={() =>
              toast.error(MESSAGES.error[ERROR_CODES.GOOGLE_SIGNIN_FAILED])
            }
            useOneTap={false}
          />
        </div>
      </div>
    </div>
  );
};

const styles = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '80vh',
    padding: '16px',
    fontFamily: 'sans-serif',
    boxSizing: 'border-box',
  },
  card: {
    width: '100%',
    maxWidth: '420px',
    padding: '40px 32px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
    borderRadius: '12px',
    textAlign: 'center',
    backgroundColor: '#fff',
    boxSizing: 'border-box',
  },
  title: {
    color: '#2c3e50',
    marginBottom: '10px',
    fontSize: 'clamp(1.2rem, 4vw, 1.6rem)',
  },
  subtitle: {
    color: '#7f8c8d',
    marginBottom: '30px',
    fontSize: 'clamp(0.85rem, 2.5vw, 1rem)',
  },
  btnWrapper: {
    display: 'flex',
    justifyContent: 'center',
  },
};

export default Login;
