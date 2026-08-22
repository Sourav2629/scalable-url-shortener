import api from './api';

export async function createShortUrl(originalUrl) {
  const response = await api.post('/api/v1/public/urls', { originalUrl });
  return response.data.url;
}

export async function createAuthenticatedUrl(urlData) {
  const response = await api.post('/api/v1/urls', urlData);
  return response.data.url;
}

export async function getUserUrls(params = {}) {
  const { page = 1, limit = 20, search, sortBy = 'createdAt', sortOrder = 'desc' } = params;
  const queryParams = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    sortBy,
    sortOrder,
  });
  if (search) queryParams.append('search', search);
  const response = await api.get(`/api/v1/urls?${queryParams.toString()}`);
  return response.data;
}

export async function getUrlById(id) {
  const response = await api.get(`/api/v1/urls/${id}`);
  return response.data.url;
}

export async function updateUrl(id, urlData) {
  const response = await api.patch(`/api/v1/urls/${id}`, urlData);
  return response.data.url;
}

export async function deleteUrl(id) {
  await api.delete(`/api/v1/urls/${id}`);
}

export async function checkAliasAvailability(alias) {
  const response = await api.get(`/api/v1/public/urls/check/${alias}`);
  return response.data;
}

export async function getUrlAnalyticsSummary(id) {
  const response = await api.get(`/api/v1/urls/${id}/analytics/summary`);
  return response.data;
}

export async function getUrlAnalyticsTimeseries(id, params = {}) {
  const { from, to, interval = 'day' } = params;
  const queryParams = new URLSearchParams();
  if (from) queryParams.append('from', from);
  if (to) queryParams.append('to', to);
  if (interval) queryParams.append('interval', interval);
  const response = await api.get(`/api/v1/urls/${id}/analytics/timeseries?${queryParams.toString()}`);
  return response.data;
}
