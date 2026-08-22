import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000',
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

let isRedirectingToLogin = false;

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const requestUrl = error.config?.url || '';

    // If a protected endpoint returns 401, the session is invalid.
    // Clear the local session and redirect to login.
    // Skip login/register endpoints — 401 there means bad credentials, not an expired session.
    const isAuthEndpoint = requestUrl.includes('/api/v1/auth/login') || requestUrl.includes('/api/v1/auth/register');

    if (status === 401 && !isAuthEndpoint && !isRedirectingToLogin) {
      isRedirectingToLogin = true;
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      window.location.href = '/login';
    }

    return Promise.reject(error);
  }
);

export default api;
