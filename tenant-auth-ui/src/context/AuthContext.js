import React, { createContext, useContext, useState, useEffect } from 'react';
import Cookies from 'js-cookie';
import logger from '../utils/logger';
import { decodeToken, getUserFromToken } from '../utils/tokenUtils';
import api from '../api/api';
import {
  login as authLogin,
  logout as authLogout,
  switchTenant as authSwitch,
} from '../services/authService';
import { toast } from 'react-toastify';
import { MESSAGES, APP_CONFIG } from '../constants';
import { ROUTES } from '../constants/routes';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = Cookies.get(APP_CONFIG.COOKIE_NAME);
    if (token) {
      const payload = decodeToken(token);
      if (payload) {
        setUser(payload);
      } else {
        Cookies.remove(APP_CONFIG.COOKIE_NAME);
      }
    }
    setLoading(false);
  }, []);

  const login = async (googleToken) => {
    try {
      const res = await authLogin(googleToken);
      const { token } = res.data;
      Cookies.set(APP_CONFIG.COOKIE_NAME, token, {
        expires: APP_CONFIG.COOKIE_EXPIRY_HOURS / 24,
        secure: false,
      });
      const payload = decodeToken(token);
      setUser(payload);
      return true;
    } catch (err) {
      throw err;
    }
  };

  const logout = async () => {
    // 1. Attempt backend logout (don't block cleanup if it fails)
    try {
      await authLogout();
    } catch (err) {
      logger.warn('Backend logout failed:', err);
    }

    // 2. Clear the cookie
    Cookies.remove(APP_CONFIG.COOKIE_NAME);

    // 3. Clear the React state
    setUser(null);

    // 4. Clear Axios Headers
    delete api.defaults.headers.common['Authorization'];
  };

  const switchTenant = async (tenantId) => {
    logger.debug('Switching to tenant:', tenantId);
    try {
      const res = await authSwitch(tenantId);
      const { token } = res.data;

      // Update Cookie
      Cookies.set(APP_CONFIG.COOKIE_NAME, token, {
        expires: APP_CONFIG.COOKIE_EXPIRY_HOURS / 24,
      });

      // Update State (decoding the new JWT)
      const payload = decodeToken(token);
      setUser(payload);

      // Redirect to dashboard to refresh all page data for the new tenant
      window.location.href = ROUTES.DASHBOARD;
    } catch (err) {
      logger.error('Error switching tenant:', err);
      toast.error(
        err.response?.data?.message || MESSAGES.error.SWITCH_TENANT_FAILED
      );
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, login, logout, loading, switchTenant }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
