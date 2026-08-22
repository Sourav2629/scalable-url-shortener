import { useState, useEffect, useCallback, useMemo } from 'react';
import { getUserUrls } from '../services/url.service';

// The backend exposes no user-level aggregate endpoint, so we derive the
// overview stats from the user's own link collection. We request a large page
// (newest first) to keep the active-links and total-clicks totals accurate
// while still using each link's authoritative clickCount.
const AGGREGATE_LIMIT = 1000;
const RECENT_LIMIT = 5;

export function useOverview() {
  const [links, setLinks] = useState([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getUserUrls({
        page: 1,
        limit: AGGREGATE_LIMIT,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });
      setLinks(data.urls || []);
      setTotal(typeof data.total === 'number' ? data.total : (data.urls || []).length);
    } catch (err) {
      setError(
        err.response?.data?.error?.message ||
          "We couldn't load your workspace. Check your connection and try again."
      );
      setLinks([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    const activeLinks = links.filter((link) => link.isActive && !link.isDeleted).length;
    const inactiveLinks = links.filter((link) => !link.isActive && !link.isDeleted).length;
    const totalClicks = links.reduce((sum, link) => sum + (link.clickCount || 0), 0);
    return { totalLinks: total, activeLinks, inactiveLinks, totalClicks };
  }, [links, total]);

  const topPerformingLink = useMemo(() => {
    const candidates = links.filter((l) => !l.isDeleted);
    if (candidates.length === 0) return null;
    return candidates.reduce((best, link) => (link.clickCount || 0) > (best.clickCount || 0) ? link : best);
  }, [links]);

  const recentLinks = useMemo(() => links.slice(0, RECENT_LIMIT), [links]);

  return { stats, recentLinks, topPerformingLink, isLoading, error, retry: load };
}
