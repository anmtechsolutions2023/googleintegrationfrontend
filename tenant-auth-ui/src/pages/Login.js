import React from 'react';
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

const Login = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Redirect back to intended page, or dashboard
  const from = location.state?.from?.pathname || ROUTES.DASHBOARD;

  const onSuccess = async (res) => {
    try {
      // res.credential is the JWT from Google
      const result = await login(res.credential);

      if (result) {
        toast.success(MESSAGES.success.welcome);
        navigate(from, { replace: true });
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
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '80vh',
        fontFamily: 'sans-serif',
      }}
    >
      <div
        style={{
          padding: '40px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          borderRadius: '12px',
          textAlign: 'center',
          backgroundColor: '#fff',
        }}
      >
        <h2 style={{ color: '#2c3e50', marginBottom: '10px' }}>
          {STRINGS.pages.login.title}
        </h2>
        <p style={{ color: '#7f8c8d', marginBottom: '30px' }}>
          {STRINGS.pages.login.subtitle}
        </p>

        <div style={{ display: 'flex', justifyContent: 'center' }}>
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

export default Login;
