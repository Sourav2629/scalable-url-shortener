import api from './api';

export async function register({ name, email, password }) {
  const { data } = await api.post('/api/v1/auth/register', { name, email, password });
  return data;
}

export async function login({ email, password }) {
  const { data } = await api.post('/api/v1/auth/login', { email, password });
  return data;
}

export async function getCurrentUser() {
  const { data } = await api.get('/api/v1/auth/me');
  return data;
}

export async function logout() {
  await api.post('/api/v1/auth/logout');
}

export async function verifyEmail({ email, code }) {
  const { data } = await api.post('/api/v1/auth/verify-email', { email, code });
  return data;
}

export async function resendVerification({ email }) {
  const { data } = await api.post('/api/v1/auth/resend-verification', { email });
  return data;
}

export async function forgotPassword({ email }) {
  const { data } = await api.post('/api/v1/auth/forgot-password', { email });
  return data;
}

export async function resetPassword({ email, code, newPassword }) {
  const { data } = await api.post('/api/v1/auth/reset-password', { email, code, newPassword });
  return data;
}

export async function resendPasswordReset({ email }) {
  const { data } = await api.post('/api/v1/auth/resend-password-reset', { email });
  return data;
}

export async function updateProfile({ name }) {
  const { data } = await api.patch('/api/v1/auth/profile', { name });
  return data;
}

export async function changePassword({ currentPassword, newPassword }) {
  const { data } = await api.post('/api/v1/auth/change-password', { currentPassword, newPassword });
  return data;
}

export async function deleteAccount({ password }) {
  const { data } = await api.delete('/api/v1/auth/account', { data: { password } });
  return data;
}