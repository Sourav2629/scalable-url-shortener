import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useLinks } from '../hooks/useLinks';
import { formatDistanceToNow } from 'date-fns';
import { buildShortUrl } from '../utils/url-builder';

export default function LinksPage() {
  const navigate = useNavigate();
  const {
    links,
    pagination,
    isLoading,
    error,
    searchQuery,
    sortBy,
    sortOrder,
    fetchLinks,
    removeLink,
    handleSearch,
    handleSort,
    handlePageChange,
    setError,
  } = useLinks();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [successNotification, setSuccessNotification] = useState(null);

  const location = useLocation();

  // Read success notification from navigation state on mount
  useEffect(() => {
    if (location.state?.successNotification) {
      setSuccessNotification(location.state.successNotification);
      // Replace the current history entry to clear the state so it doesn't show on refresh
      navigate(window.location.pathname, { replace: true, state: undefined });
    }
  }, [location.state, navigate]);

  // Auto-dismiss notification after 5 seconds
  useEffect(() => {
    if (successNotification) {
      const timer = setTimeout(() => {
        setSuccessNotification(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [successNotification]);

  const dismissNotification = () => {
    setSuccessNotification(null);
  };

  const handleCopyShortUrl = async (shortUrl) => {
    try {
      await navigator.clipboard.writeText(shortUrl);
      // Could add a toast here, but keeping it simple
    } catch (err) {
      console.error('Failed to copy:', err);
    } finally {
      dismissNotification();
    }
  };

  const handleOpenShortUrl = (shortUrl) => {
    window.open(shortUrl, '_blank', 'noopener,noreferrer');
    dismissNotification();
    // Set a flag to refetch when user returns to this tab
    sessionStorage.setItem('shouldRefetchLinks', 'true');
  };

  // Refetch links when user returns to this tab (after clicking open in new tab)
  useEffect(() => {
    const handleFocus = () => {
      if (sessionStorage.getItem('shouldRefetchLinks') === 'true') {
        sessionStorage.removeItem('shouldRefetchLinks');
        fetchLinks(pagination.page, searchQuery);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && sessionStorage.getItem('shouldRefetchLinks') === 'true') {
        sessionStorage.removeItem('shouldRefetchLinks');
        fetchLinks(pagination.page, searchQuery);
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchLinks, pagination.page, searchQuery]);

  const handleDeleteClick = (link) => {
    setShowDeleteConfirm(link);
  };

  const confirmDelete = async () => {
    if (!showDeleteConfirm) return;
    setDeleteLoading(true);
    try {
      await removeLink(showDeleteConfirm.id);
      setShowDeleteConfirm(null);
    } catch (err) {
      // Error already handled by hook
    } finally {
      setDeleteLoading(false);
    }
  };

  const formatDate = (dateString) => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true });
    } catch {
      return 'Unknown';
    }
  };

  const getStatusBadge = (isActive, isDeleted) => {
    if (isDeleted) {
      return <span className="inline-flex items-center px-2 py-0.5 rounded-[4px] text-[10px] font-mono font-medium tracking-[0.1em] uppercase bg-[#2A313D] text-[#707A8A]">Deleted</span>;
    }
    return isActive
      ? <span className="inline-flex items-center px-2 py-0.5 rounded-[4px] text-[10px] font-mono font-medium tracking-[0.1em] uppercase bg-[#50CFA6]/15 text-[#50CFA6]">Active</span>
      : <span className="inline-flex items-center px-2 py-0.5 rounded-[4px] text-[10px] font-mono font-medium tracking-[0.1em] uppercase bg-[#F06A7A]/15 text-[#F06A7A]">Inactive</span>;
  };

  const columns = [
    { key: 'shortCode', label: 'Short Link', sortable: true },
    { key: 'originalUrl', label: 'Destination', sortable: false },
    { key: 'title', label: 'Title', sortable: true },
    { key: 'clickCount', label: 'Clicks', sortable: true },
    { key: 'status', label: 'Status', sortable: false },
    { key: 'createdAt', label: 'Created', sortable: true },
    { key: 'actions', label: '', sortable: false },
  ];

  const handleSortClick = (key) => {
    console.log('[LinksPage] handleSortClick called with:', key);
    if (columns.find((c) => c.key === key)?.sortable) {
      handleSort(key);
    }
  };

  const SortIcon = ({ columnKey }) => {
    if (sortBy !== columnKey) {
      // Neutral sort icon - sortable but not active (double-headed arrow)
      return (
        <svg className="w-4 h-4 text-[#707A8A]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M7 16l5-5 5 5M7 8l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    }
    // Active sort - show direction
    return (
      <svg className={`w-4 h-4 text-[#F2B95F] ${sortOrder === 'asc' ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M7 16l5-5 5 5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  };

  // Empty state check
  const isEmpty = !isLoading && links.length === 0 && !error;

  return (
    <>
      <div className="w-full">
      {/* Page header */}
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#151922] border border-[#2A313D] text-[10px] font-mono font-semibold tracking-[0.14em] uppercase text-[#707A8A] mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-[#50CFA6]" aria-hidden="true" />
          AUTHENTICATED
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-[32px] md:text-[40px] font-extrabold tracking-[-0.03em] leading-[1.04] mb-2 text-[#F5F7FA]">
              YOUR LINKS
            </h1>
            <p className="text-[16px] text-[#A8B0BD] leading-[1.6] max-w-[500px]">
              Manage your shortened links. Create, edit, and track performance.
            </p>
          </div>
          <Link
            to="/app/links/new"
            className="h-10 px-5 inline-flex items-center justify-center gap-2 rounded-[6px] bg-[#F2B95F] text-[#0E1117] font-semibold text-[13px] hover:bg-[#E4A744] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0E1117] whitespace-nowrap"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Create Link
          </Link>
        </div>
      </div>

      {/* Success notification banner */}
      {successNotification && (
        <div className="mb-6 animate-slide-in" role="alert">
          <div className="bg-[#151922] border border-[#50CFA6]/30 rounded-[12px] p-4 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-10 h-10 rounded-full bg-[#50CFA6]/10 border border-[#50CFA6]/30 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-[#50CFA6]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                    <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-[#F5F7FA]">Link Created</h3>
                  <p className="text-[12px] text-[#A8B0BD] mt-0.5">Your short link is ready to share.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={dismissNotification}
                className="p-1.5 text-[#707A8A] hover:text-[#F5F7FA] hover:bg-[#2A313D] rounded-[6px] transition-colors flex-shrink-0"
                aria-label="Dismiss notification"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>

            <div className="bg-[#0E1117] border border-[#2A313D] rounded-[8px] p-3">
              <code className="text-[13px] font-mono text-[#F5F7FA] break-all">{successNotification.shortUrl}</code>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleCopyShortUrl(successNotification.shortUrl)}
                className="flex-1 h-10 px-4 inline-flex items-center justify-center gap-2 rounded-[6px] bg-[#F2B95F] text-[#0E1117] font-semibold text-[12px] hover:bg-[#E4A744] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0E1117]"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                Copy
              </button>
              <button
                type="button"
                onClick={() => handleOpenShortUrl(successNotification.shortUrl)}
                className="flex-1 h-10 px-4 inline-flex items-center justify-center gap-2 rounded-[6px] bg-[#1E242D] border border-[#2A313D] text-[#A8B0BD] font-semibold text-[12px] hover:bg-[#2A313D] hover:text-[#F5F7FA] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0E1117]"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
                Open
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search and filter bar */}
      <div className="mb-6 flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-md">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#707A8A]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="search"
            placeholder="Search links..."
            value={searchQuery}
            onChange={(e) => {
              console.log('[LinksPage] search input changed:', e.target.value);
              handleSearch(e.target.value);
            }}
            className="w-full h-10 pl-10 pr-4 bg-[#151922] border border-[#2A313D] rounded-[6px] text-[#F5F7FA] placeholder-[#707A8A] focus:border-[#F2B95F] focus:outline-none focus:ring-1 focus:ring-[#F2B95F] transition-colors"
            aria-label="Search links"
          />
        </div>
        <div className="flex items-center gap-2 text-sm text-[#707A8A]">
          <span>{pagination.total} link{pagination.total !== 1 ? 's' : ''}</span>
          {pagination.totalPages > 1 && (
            <>
              <span className="text-[#2A313D]">|</span>
              <span>Page {pagination.page} of {pagination.totalPages}</span>
            </>
          )}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="mb-6 p-4 bg-[#F06A7A]/10 border border-[#F06A7A]/30 rounded-[10px] flex items-start gap-3" role="alert">
          <svg className="w-5 h-5 text-[#F06A7A] mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div className="flex-1">
            <p className="text-sm font-medium text-[#F06A7A]">Failed to load links</p>
            <p className="text-[13px] text-[#A8B0BD] mt-1">{error}</p>
            <button
              type="button"
              onClick={() => fetchLinks(pagination.page)}
              className="mt-2 text-sm text-[#F2B95F] hover:text-[#E4A744] underline"
            >
              Try again
            </button>
          </div>
        </div>
      )}

      {/* Links table */}
      <div className="border border-[#2A313D] bg-[#151922] rounded-[14px] overflow-hidden">
        {/* Table header */}
        <div className="px-6 md:px-7 py-4 border-b border-[#2A313D] bg-[#1B202B]/40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <span className="text-[11px] font-mono font-bold tracking-[0.14em] uppercase text-[#F5F7FA] flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#F2B95F]" aria-hidden="true" />
            YOUR LINKS
          </span>
          <span className="text-[10px] font-mono tracking-wider uppercase text-[#707A8A]">
            {pagination.total} LINK{pagination.total !== 1 ? 'S' : ''}
          </span>
        </div>

        {/* Loading state */}
        {isLoading && links.length === 0 && (
          <div className="p-6 md:p-10 flex flex-col items-center justify-center min-h-[280px] text-center">
            <div className="w-8 h-8 border-2 border-[#2A313D] border-t-[#F2B95F] rounded-full animate-spin mb-4" aria-hidden="true" />
            <h3 className="text-lg font-semibold text-[#F5F7FA] mb-2">Loading links...</h3>
            <p className="text-sm text-[#A8B0BD]">Please wait while we fetch your links.</p>
          </div>
        )}

        {/* Empty state */}
        {isEmpty && (
          <div className="p-6 md:p-10 flex flex-col items-center justify-center min-h-[280px] text-center">
            <div className="w-12 h-12 rounded-full bg-[#1B202B] border border-[#2A313D] flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-[#707A8A]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-4.686a4.5 4.5 0 00-1.242-7.244l4.5-4.5a4.5 4.5 0 016.364 6.364l-1.757 1.757" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-[#F5F7FA] mb-2">No links yet</h3>
            <p className="text-sm text-[#A8B0BD] max-w-[320px] mb-6">
              Create your first shortened link to get started.
            </p>
            <Link
              to="/app/links/new"
              className="h-10 px-5 inline-flex items-center justify-center gap-2 rounded-[6px] bg-[#F2B95F] text-[#0E1117] font-semibold text-[13px] hover:bg-[#E4A744] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0E1117]"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <path d="M12 5v14M5 12h14" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Create your first link
            </Link>
          </div>
        )}

        {/* Links table - show when there are links (keep visible during loading to prevent flicker) */}
        {links.length > 0 && (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full" role="table">
                <thead>
                  <tr className="border-b border-[#2A313D]">
                    {columns.map((col) => (
                      <th
                        key={col.key}
                        className={`px-4 py-3 text-left text-[11px] font-mono font-bold tracking-[0.14em] uppercase text-[#707A8A] ${col.sortable ? 'cursor-pointer hover:text-[#F5F7FA]' : ''}`}
                        onClick={() => handleSortClick(col.key)}
                        style={{ width: col.key === 'actions' ? '100px' : col.key === 'clickCount' ? '80px' : col.key === 'status' ? '100px' : 'auto' }}
                      >
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          {col.label}
                          {col.sortable && <SortIcon columnKey={col.key} />}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {links.map((link) => (
                    <tr key={link.id} className="border-b border-[#2A313D]/50 hover:bg-[#1B202B]/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <code className="text-[13px] font-mono text-[#F2B95F] bg-[#1B202B] px-2 py-1 rounded-[4px] border border-[#2A313D]">
                            {buildShortUrl(link.shortCode)}
                          </code>
                          <button
                            type="button"
                            onClick={() => navigator.clipboard.writeText(buildShortUrl(link.shortCode))}
                            className="p-1.5 rounded-[4px] text-[#707A8A] hover:text-[#F5F7FA] hover:bg-[#222936] transition-colors"
                            aria-label="Copy short link"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenShortUrl(buildShortUrl(link.shortCode))}
                            className="p-1.5 rounded-[4px] text-[#707A8A] hover:text-[#F2B95F] hover:bg-[#222936] transition-colors"
                            aria-label="Open short link"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                              <polyline points="15 3 21 3 21 9" />
                              <line x1="10" y1="14" x2="21" y2="3" />
                            </svg>
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <a
                          href={link.originalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[13px] text-[#A8B0BD] hover:text-[#F5F7FA] truncate block max-w-[300px] font-mono"
                          title={link.originalUrl}
                        >
                          {link.originalUrl}
                        </a>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[13px] text-[#F5F7FA] truncate block max-w-[200px]">
                          {link.title || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[13px] font-mono text-[#F5F7FA] tabular-nums">{link.clickCount || 0}</span>
                      </td>
                      <td className="px-4 py-3">
                        {getStatusBadge(link.isActive, link.isDeleted)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[12px] text-[#707A8A] font-mono whitespace-nowrap">
                          {formatDate(link.createdAt)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <Link
                            to={`/app/links/${link.id}/edit`}
                            className="p-1.5 rounded-[4px] text-[#707A8A] hover:text-[#F2B95F] hover:bg-[#222936] transition-colors"
                            aria-label={`Edit ${link.shortCode}`}
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" strokeLinecap="round" strokeLinejoin="round" />
                              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </Link>
                          <Link
                            to={`/app/links/${link.id}`}
                            className="p-1.5 rounded-[4px] text-[#707A8A] hover:text-[#50CFA6] hover:bg-[#222936] transition-colors"
                            aria-label={`View details for ${link.shortCode}`}
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" strokeLinecap="round" strokeLinejoin="round" />
                              <circle cx="12" cy="12" r="3" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleDeleteClick(link)}
                            disabled={deleteLoading}
                            className="p-1.5 rounded-[4px] text-[#707A8A] hover:text-[#F06A7A] hover:bg-[#222936] transition-colors disabled:opacity-50"
                            aria-label={`Delete ${link.shortCode}`}
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                              <polyline points="3 6 5 6 21 6" strokeLinecap="round" strokeLinejoin="round" />
                              <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden p-4 space-y-3">
              {links.map((link) => (
                <div key={link.id} className="bg-[#1B202B] border border-[#2A313D] rounded-[10px] p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <code className="text-[12px] font-mono text-[#F2B95F] bg-[#0E1117] px-2 py-1 rounded-[4px] border border-[#2A313D] flex-1 truncate">
                          {buildShortUrl(link.shortCode)}
                        </code>
                        <button
                          type="button"
                          onClick={() => navigator.clipboard.writeText(buildShortUrl(link.shortCode))}
                          className="p-1.5 rounded-[4px] text-[#707A8A] hover:text-[#F5F7FA] hover:bg-[#222936] transition-colors flex-shrink-0"
                          aria-label="Copy short link"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenShortUrl(buildShortUrl(link.shortCode))}
                          className="p-1.5 rounded-[4px] text-[#707A8A] hover:text-[#F2B95F] hover:bg-[#222936] transition-colors flex-shrink-0"
                          aria-label="Open short link"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <polyline points="15 3 21 3 21 9" />
                            <line x1="10" y1="14" x2="21" y2="3" />
                          </svg>
                        </button>
                      </div>
                      <a
                        href={link.originalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[12px] text-[#A8B0BD] hover:text-[#F5F7FA] truncate block font-mono mb-2"
                        title={link.originalUrl}
                      >
                        {link.originalUrl}
                      </a>
                      {link.title && (
                        <p className="text-[13px] text-[#F5F7FA] mb-2">{link.title}</p>
                      )}
                    </div>
                    {getStatusBadge(link.isActive, link.isDeleted)}
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-[11px] font-mono text-[#707A8A] mb-3">
                    <span>{link.clickCount || 0} clicks</span>
                    <span>Created {formatDate(link.createdAt)}</span>
                  </div>

                  <div className="flex items-center gap-2 pt-3 border-t border-[#2A313D]">
                    <Link
                      to={`/app/links/${link.id}/edit`}
                      className="flex-1 h-9 px-3 inline-flex items-center justify-center gap-2 rounded-[6px] bg-[#1B202B] border border-[#2A313D] text-[12px] font-medium text-[#A8B0BD] hover:bg-[#222936] hover:text-[#F2B95F] transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Edit
                    </Link>
                    <Link
                      to={`/app/links/${link.id}`}
                      className="flex-1 h-9 px-3 inline-flex items-center justify-center gap-2 rounded-[6px] bg-[#1B202B] border border-[#2A313D] text-[12px] font-medium text-[#A8B0BD] hover:bg-[#222936] hover:text-[#50CFA6] transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" strokeLinecap="round" strokeLinejoin="round" />
                        <circle cx="12" cy="12" r="3" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Details
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleDeleteClick(link)}
                      disabled={deleteLoading}
                      className="h-9 px-3 inline-flex items-center justify-center gap-2 rounded-[6px] bg-[#1B202B] border border-[#F06A7A]/30 text-[12px] font-medium text-[#F06A7A] hover:bg-[#F06A7A]/10 transition-colors disabled:opacity-50"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <polyline points="3 6 5 6 21 6" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="px-6 md:px-7 py-4 border-t border-[#2A313D] bg-[#1B202B]/40 flex flex-col sm:flex-row items-center justify-between gap-3">
                <span className="text-[11px] font-mono text-[#707A8A]">
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handlePageChange(pagination.page - 1)}
                    disabled={pagination.page <= 1 || isLoading}
                    className="h-9 px-3 inline-flex items-center justify-center rounded-[6px] bg-[#1B202B] border border-[#2A313D] text-[12px] font-medium text-[#A8B0BD] hover:bg-[#222936] hover:text-[#F5F7FA] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePageChange(pagination.page + 1)}
                    disabled={pagination.page >= pagination.totalPages || isLoading}
                    className="h-9 px-3 inline-flex items-center justify-center rounded-[6px] bg-[#1B202B] border border-[#2A313D] text-[12px] font-medium text-[#A8B0BD] hover:bg-[#222936] hover:text-[#F5F7FA] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>

    {/* Delete confirmation modal */}
    {showDeleteConfirm && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0E1117]/80 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-modal-title"
        aria-describedby="delete-modal-description"
      >
        <div className="w-full max-w-md bg-[#151922] border border-[#2A313D] rounded-[14px] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          <div className="px-6 py-5 border-b border-[#2A313D]">
            <h2 id="delete-modal-title" className="text-lg font-semibold text-[#F5F7FA]">
              Delete link
            </h2>
          </div>
          <div className="px-6 py-5">
            <p id="delete-modal-description" className="text-[#A8B0BD] leading-relaxed">
              Are you sure you want to delete <code className="text-[#F2B95F] font-mono bg-[#1B202B] px-1.5 py-0.5 rounded-[4px] border border-[#2A313D]">linksphere.app/{showDeleteConfirm.shortCode}</code>? This action cannot be undone.
            </p>
          </div>
          <div className="px-6 py-4 border-t border-[#2A313D] bg-[#1B202B]/40 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(null)}
              disabled={deleteLoading}
              className="h-10 px-4 inline-flex items-center justify-center rounded-[6px] bg-[#1B202B] border border-[#2A313D] text-[13px] font-medium text-[#A8B0BD] hover:bg-[#222936] hover:text-[#F5F7FA] transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0E1117]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmDelete}
              disabled={deleteLoading}
              className="h-10 px-4 inline-flex items-center justify-center gap-2 rounded-[6px] bg-[#F06A7A] text-[#0E1117] font-semibold text-[13px] hover:bg-[#F06A7A]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F06A7A] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0E1117]"
            >
              {deleteLoading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                    <path d="M12 2a10 10 0 0110 10" strokeLinecap="round" />
                  </svg>
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </button>
          </div>
        </div>
      </div>
    )}
  </>
  );
}