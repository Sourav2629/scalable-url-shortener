import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach access token to every request
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

// Single-flight refresh: only one refresh request at a time
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(token);
    }
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status;
    const originalRequest = error.config;
    const requestUrl = error.config?.url || '';

    // Skip refresh logic for auth endpoints and the refresh endpoint itself
    const isAuthEndpoint =
      requestUrl.includes('/api/v1/auth/login') ||
      requestUrl.includes('/api/v1/auth/register') ||
      requestUrl.includes('/api/v1/auth/verify-email') ||
      requestUrl.includes('/api/v1/auth/resend-verification') ||
      requestUrl.includes('/api/v1/auth/forgot-password') ||
      requestUrl.includes('/api/v1/auth/reset-password') ||
      requestUrl.includes('/api/v1/auth/resend-password-reset') ||
      requestUrl.includes('/api/v1/auth/refresh');

    // If 401 on a protected endpoint and we haven't already retried
    if (status === 401 && !isAuthEndpoint && !originalRequest._retry) {
      const refreshToken = localStorage.getItem('refreshToken');

      // No refresh token available — clear session and redirect
      if (!refreshToken) {
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        if (!window.location.pathname.startsWith('/login')) {
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }

      // If already refreshing, queue this request. Mark it as already-retried
      // BEFORE replay so a replayed queued request can never trigger a second
      // refresh cycle (no infinite interceptor loop).
      if (isRefreshing) {
        originalRequest._retry = true;
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((newToken) => {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const { data } = await axios.post(
          `${api.defaults.baseURL}/api/v1/auth/refresh`,
          { refreshToken },
          { headers: { 'Content-Type': 'application/json' } }
        );

        const { accessToken, refreshToken: newRefreshToken } = data.tokens;

        // Store new tokens
        localStorage.setItem('token', accessToken);
        localStorage.setItem('refreshToken', newRefreshToken);

        // Update the original request
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;

        // Process any queued requests
        processQueue(null, accessToken);

        return api(originalRequest);
      } catch (refreshError) {
        // Refresh failed — clear everything and redirect to login
        processQueue(refreshError);
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        if (!window.location.pathname.startsWith('/login')) {
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // For all other errors, just reject
    return Promise.reject(error);
  }
);

export default api;
