import axios from 'axios';
import Cookies from 'js-cookie';
import { AUTH } from '../config/config';
import { HTTP_STATUS } from '../constants/httpCodes';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL,
});

api.interceptors.request.use((config) => {
  const token = Cookies.get('app_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    // Check if the error is 401 AND it's NOT the login request
    const isLoginRequest = err.config.url.includes(AUTH.LOGIN);

    if (err.response?.status === HTTP_STATUS.UNAUTHORIZED && !isLoginRequest) {
      Cookies.remove('app_token');
      // Only redirect if it's an expired session, not a failed login attempt
      window.location.href = '/login?session=expired';
    }

    return Promise.reject(err);
  }
);

export default api;
