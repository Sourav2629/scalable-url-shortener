import { useState, useCallback, useEffect } from 'react';
import { getUrlById, getUrlAnalyticsSummary, getUrlAnalyticsTimeseries } from '../services/url.service';

export function useLinkDetails(id) {
  const [link, setLink] = useState(null);
  const [summary, setSummary] = useState(null);
  const [timeseries, setTimeseries] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState({ from: null, to: null });

  // Default to last 30 days
  const getDefaultDateRange = useCallback(() => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 30);
    return { from, to };
  }, []);

  const fetchLink = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    try {
      const linkData = await getUrlById(id);
      setLink(linkData);
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message || 'Failed to fetch link');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  const fetchSummary = useCallback(async () => {
    if (!id) return;
    try {
      const summaryData = await getUrlAnalyticsSummary(id);
      setSummary(summaryData);
    } catch (err) {
      console.error('Failed to fetch analytics summary:', err);
    }
  }, [id]);

  const fetchTimeseries = useCallback(async (from, to, interval = 'day') => {
    if (!id) return;
    try {
      const timeseriesData = await getUrlAnalyticsTimeseries(id, { from, to, interval });
      setTimeseries(timeseriesData);
    } catch (err) {
      console.error('Failed to fetch timeseries:', err);
    }
  }, [id]);

  // Initialize date range on mount
  useEffect(() => {
    const defaultRange = getDefaultDateRange();
    setDateRange(defaultRange);
  }, [getDefaultDateRange]);

  // Fetch link on mount
  useEffect(() => {
    fetchLink();
  }, [fetchLink]);

  // Fetch summary when link loads
  useEffect(() => {
    if (link) {
      fetchSummary();
    }
  }, [link, fetchSummary]);

  // Fetch timeseries when date range changes
  useEffect(() => {
    if (link && dateRange.from && dateRange.to) {
      const interval = dateRange.from.getTime() === dateRange.to.getTime() ? 'hour' : 'day';
      fetchTimeseries(dateRange.from.toISOString(), dateRange.to.toISOString(), interval);
    }
  }, [link, dateRange, fetchTimeseries]);

  const refresh = useCallback(() => {
    fetchLink();
    fetchSummary();
    if (dateRange.from && dateRange.to) {
      const interval = dateRange.from.getTime() === dateRange.to.getTime() ? 'hour' : 'day';
      fetchTimeseries(dateRange.from.toISOString(), dateRange.to.toISOString(), interval);
    }
  }, [fetchLink, fetchSummary, fetchTimeseries, dateRange]);

  const updateDateRange = useCallback((newRange) => {
    setDateRange(newRange);
  }, []);

  return {
    link,
    summary,
    timeseries,
    isLoading,
    error,
    dateRange,
    updateDateRange,
    refresh,
    setError,
  };
}