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

api.interceptors.response.use(
  (res) => res,
  (err) => {
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

    return Promise.reject(err);
  }
);

export default api;
