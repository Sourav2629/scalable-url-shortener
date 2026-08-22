import { useState, useCallback, useEffect, useRef } from 'react';
import {
  createAuthenticatedUrl,
  getUserUrls,
  getUrlById,
  updateUrl,
  deleteUrl,
} from '../services/url.service';

export function useLinks() {
  const [links, setLinks] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('desc');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Refs to read current sort state without nesting setState
  const sortByRef = useRef(sortBy);
  const sortOrderRef = useRef(sortOrder);
  useEffect(() => {
    sortByRef.current = sortBy;
    sortOrderRef.current = sortOrder;
  }, [sortBy, sortOrder]);

  // Debounce search: input updates instantly, API call waits 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPagination((prev) => ({ ...prev, page: 1 }));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchLinks = useCallback(async (page = 1, search = '') => {
    console.log('[useLinks] fetchLinks called with:', { page, search, sortBy, sortOrder, limit: pagination.limit });
    setIsLoading(true);
    setError(null);
    try {
      const data = await getUserUrls({
        page,
        limit: pagination.limit,
        search,
        sortBy,
        sortOrder,
      });
      console.log('[useLinks] fetchLinks response:', data);
      setLinks(data.urls || []);
      setPagination((prev) => ({
        ...prev,
        page: data.page || 1,
        total: data.total || 0,
        totalPages: data.totalPages || 0,
      }));
    } catch (err) {
      console.error('[useLinks] fetchLinks error:', err);
      setError(err.response?.data?.error?.message || err.message || 'Failed to fetch links');
      setLinks([]);
    } finally {
      setIsLoading(false);
    }
  }, [pagination.limit, sortBy, sortOrder]);

  const createLink = useCallback(async (urlData) => {
    setIsLoading(true);
    setError(null);
    try {
      const newLink = await createAuthenticatedUrl(urlData);
      setLinks((prev) => [newLink, ...prev]);
      setPagination((prev) => ({ ...prev, total: prev.total + 1 }));
      return newLink;
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message || 'Failed to create link');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateLink = useCallback(async (id, urlData) => {
    setIsLoading(true);
    setError(null);
    try {
      const updatedLink = await updateUrl(id, urlData);
      setLinks((prev) => prev.map((link) => (link.id === id ? updatedLink : link)));
      return updatedLink;
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message || 'Failed to update link');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const removeLink = useCallback(async (id) => {
    setIsLoading(true);
    setError(null);
    try {
      await deleteUrl(id);
      setLinks((prev) => prev.filter((link) => link.id !== id));
      setPagination((prev) => ({ ...prev, total: prev.total - 1 }));
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message || 'Failed to delete link');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getLink = useCallback(async (id) => {
    setIsLoading(true);
    setError(null);
    try {
      const link = await getUrlById(id);
      return link;
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message || 'Failed to fetch link');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleSearch = useCallback((query) => {
    setSearchQuery(query);
  }, []);

  const handleSort = useCallback((field) => {
    const currentSortBy = sortByRef.current;
    const currentSortOrder = sortOrderRef.current;
    if (currentSortBy === field) {
      setSortOrder(currentSortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortOrder('desc');
    }
    setSortBy(field);
  }, []);

  const handlePageChange = useCallback((page) => {
    setPagination((prev) => ({ ...prev, page }));
  }, []);

  // Auto-fetch when debounced search, sort, or page changes
  useEffect(() => {
    fetchLinks(pagination.page, debouncedSearch);
  }, [fetchLinks, pagination.page, debouncedSearch, sortBy, sortOrder]);

  return {
    links,
    pagination,
    isLoading,
    error,
    searchQuery,
    sortBy,
    sortOrder,
    fetchLinks,
    createLink,
    updateLink,
    removeLink,
    getLink,
    handleSearch,
    handleSort,
    handlePageChange,
    setError,
  };
}