import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { format, subDays, startOfDay, endOfDay, parseISO } from 'date-fns';
import { useLinkDetails } from '../hooks/useLinkDetails';
import { deleteUrl } from '../services/url.service';
import { buildShortUrl } from '../utils/url-builder';

const DATE_RANGE_OPTIONS = [
  { value: '7d', label: '7 days', days: 7 },
  { value: '30d', label: '30 days', days: 30 },
  { value: '90d', label: '90 days', days: 90 },
];

function getDateRangeFromOption(option) {
  const to = endOfDay(new Date());
  const days = DATE_RANGE_OPTIONS.find(o => o.value === option)?.days || 30;
  const from = startOfDay(subDays(new Date(), days - 1));
  return { from, to };
}

const numberFormat = new Intl.NumberFormat('en-US');

function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return String(num);
}

function pct(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

function StatusBadge({ isActive, isExpired }) {
  if (!isActive || isExpired) {
    return <span className="inline-flex items-center px-2 py-0.5 rounded-[4px] text-[10px] font-mono font-medium tracking-[0.1em] uppercase bg-[#F06B7A]/15 text-[#F06B7A]">Inactive</span>;
  }
  return <span className="inline-flex items-center px-2 py-0.5 rounded-[4px] text-[10px] font-mono font-medium tracking-[0.1em] uppercase bg-[#50CFA6]/15 text-[#50CFA6]">Active</span>;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="space-y-3">
        <div className="h-3 w-24 bg-[#1B202B] rounded" />
        <div className="h-8 w-48 bg-[#1B202B] rounded" />
        <div className="h-5 w-72 bg-[#1B202B] rounded" />
        <div className="flex gap-3 mt-4">
          <div className="h-9 w-20 bg-[#1B202B] rounded-[6px]" />
          <div className="h-9 w-20 bg-[#1B202B] rounded-[6px]" />
          <div className="h-9 w-20 bg-[#1B202B] rounded-[6px]" />
        </div>
      </div>
      <div className="h-32 bg-[#151922] rounded-[10px] border border-[#2A313D]" />
      <div className="h-64 bg-[#151922] rounded-[10px] border border-[#2A313D]" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="h-48 bg-[#151922] rounded-[10px] border border-[#2A313D]" />
        <div className="h-48 bg-[#151922] rounded-[10px] border border-[#2A313D]" />
      </div>
    </div>
  );
}

function ErrorState({ message, onRetry, onBack }) {
  return (
    <div className="text-center py-20">
      <div className="w-12 h-12 rounded-full bg-[#F06B7A]/10 border border-[#F06B7A]/20 flex items-center justify-center mx-auto mb-4">
        <svg className="w-5 h-5 text-[#F06B7A]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <h3 className="text-[#F5F7FA] text-lg font-semibold mb-1">Unable to load link data</h3>
      <p className="text-[#707A8A] text-sm mb-6">{message}</p>
      <div className="flex items-center justify-center gap-3">
        <button onClick={onBack} className="h-9 px-4 rounded-[6px] bg-[#1B202B] border border-[#2A313D] text-[13px] font-medium text-[#A8B0BD] hover:text-[#F5F7FA] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0E1117]">Back to Links</button>
        <button onClick={onRetry} className="h-9 px-4 rounded-[6px] bg-[#F2B95F] text-[#0E1117] text-[13px] font-semibold hover:bg-[#E4A744] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0E1117]">Try Again</button>
      </div>
    </div>
  );
}

function NotFoundState({ onBack }) {
  return (
    <div className="text-center py-20">
      <div className="w-12 h-12 rounded-full bg-[#F2B95F]/10 border border-[#F2B95F]/20 flex items-center justify-center mx-auto mb-4">
        <svg className="w-5 h-5 text-[#F2B95F]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h3 className="text-[#F5F7FA] text-lg font-semibold mb-1">Link not found</h3>
      <p className="text-[#707A8A] text-sm mb-6">This link doesn't exist or may have been deleted.</p>
      <button onClick={onBack} className="h-9 px-5 rounded-[6px] bg-[#F2B95F] text-[#0E1117] text-[13px] font-semibold hover:bg-[#E4A744] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0E1117]">Back to Links</button>
    </div>
  );
}

const CHART_WIDTH = 800;
const CHART_HEIGHT = 300;
const CHART_MARGIN = { top: 30, right: 12, bottom: 32, left: 8 };

function SparklineChart({ data, label }) {
  const svgRef = useRef(null);
  const [hoverIdx, setHoverIdx] = useState(null);
  const [tooltipPos, setTooltipPos] = useState(null);

  const { path, areaPath, points, baseline } = useMemo(() => {
    if (!data.length) return { path: '', areaPath: '', points: [], baseline: 0 };
    const w = CHART_WIDTH - CHART_MARGIN.left - CHART_MARGIN.right;
    const h = CHART_HEIGHT - CHART_MARGIN.top - CHART_MARGIN.bottom;
    const maxVal = Math.max(...data.map(d => d.clicks), 1);
    const baseY = CHART_MARGIN.top + h;

    const pts = data.map((d, i) => {
      const x = CHART_MARGIN.left + (i / (data.length - 1 || 1)) * w;
      const y = CHART_MARGIN.top + h - (d.clicks / maxVal) * h;
      return { x, y, ...d };
    });

    // Smooth curve through points
    let d = `M${pts[0].x},${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1];
      const cur = pts[i];
      const cpx = (prev.x + cur.x) / 2;
      d += ` C${cpx},${prev.y} ${cpx},${cur.y} ${cur.x},${cur.y}`;
    }
    const area = `${d} L${pts[pts.length - 1].x},${baseY} L${pts[0].x},${baseY} Z`;

    return { path: d, areaPath: area, points: pts, baseline: baseY };
  }, [data]);

  const handleMouseMove = useCallback((e) => {
    if (!points.length || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * CHART_WIDTH;
    let closest = 0;
    let minDist = Infinity;
    points.forEach((p, i) => {
      const dist = Math.abs(p.x - mouseX);
      if (dist < minDist) { minDist = dist; closest = i; }
    });
    setHoverIdx(closest);
    const svgX = (e.clientX - rect.left) / rect.width * 100;
    const svgY = (e.clientY - rect.top) / rect.height * 100;
    setTooltipPos({ x: svgX, y: svgY });
  }, [points]);

  return (
    <div className="relative h-full w-full">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        width="100%"
        height="100%"
        preserveAspectRatio="none"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => { setHoverIdx(null); setTooltipPos(null); }}
        role="img"
        aria-label={label || 'Click activity chart'}
        style={{ display: 'block' }}
      >
        <defs>
          <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F2B95F" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#F2B95F" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Grid lines — strictly within data region */}
        <g stroke="#2A313D" strokeWidth="1" strokeDasharray="3 3">
          <path d={`M${CHART_MARGIN.left},${CHART_MARGIN.top} H${CHART_WIDTH - CHART_MARGIN.right}`} />
          <path d={`M${CHART_MARGIN.left},${CHART_MARGIN.top + (CHART_HEIGHT - CHART_MARGIN.top - CHART_MARGIN.bottom) * 0.5} H${CHART_WIDTH - CHART_MARGIN.right}`} />
          <path d={`M${CHART_MARGIN.left},${baseline} H${CHART_WIDTH - CHART_MARGIN.right}`} />
        </g>
        {/* Area fill */}
        <path d={areaPath} fill="url(#sparkGrad)" />
        {/* Line */}
        <path d={path} fill="none" stroke="#F2B95F" strokeWidth="2.5" strokeLinecap="round" />
        {/* Hover dot */}
        {hoverIdx !== null && points[hoverIdx] && (
          <circle cx={points[hoverIdx].x} cy={points[hoverIdx].y} r="5" fill="#F2B95F" stroke="#0E1117" strokeWidth="2" />
        )}
      </svg>
      {/* Tooltip */}
      {hoverIdx !== null && tooltipPos && points[hoverIdx] && (
        <div
          className="pointer-events-none absolute z-50 px-3 py-2 rounded-[6px] bg-[#1B202B] border border-[#2A313D] text-xs"
          style={{ left: `${Math.min(Math.max(tooltipPos.x, 5), 90)}%`, top: '12px', transform: 'translateX(-50%)' }}
        >
          <p className="text-[#707A8A] font-mono mb-0.5">{points[hoverIdx].date}</p>
          <p className="text-[#F5F7FA] font-semibold">{numberFormat.format(points[hoverIdx].clicks)} clicks</p>
        </div>
      )}
    </div>
  );
}

export default function LinkDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { link, summary, timeseries, isLoading, error, updateDateRange, refresh } = useLinkDetails(id);

  const [selectedRange, setSelectedRange] = useState('30d');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [notification, setNotification] = useState(null);

  useEffect(() => {
    if (location.state?.successNotification) {
      setNotification({ type: 'success', message: `Link "${location.state.successNotification.title || 'Untitled'}" created successfully` });
      navigate(window.location.pathname, { replace: true, state: undefined });
    }
  }, [location.state, navigate]);

  useEffect(() => {
    if (notification) {
      const t = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(t);
    }
  }, [notification]);

  const handleRangeChange = useCallback((value) => {
    setSelectedRange(value);
    const { from, to } = getDateRangeFromOption(value);
    updateDateRange({ from, to });
  }, [updateDateRange]);

  const handleCopy = useCallback(async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(buildShortUrl(link.shortCode));
      setNotification({ type: 'success', message: 'Short URL copied to clipboard' });
    } catch {
      setNotification({ type: 'error', message: 'Failed to copy URL' });
    }
  }, [link]);

  const handleOpen = useCallback(() => {
    if (!link) return;
    window.open(buildShortUrl(link.shortCode), '_blank', 'noopener,noreferrer');
  }, [link]);

  const closeDeleteModal = useCallback(() => {
    if (!isDeleting) setShowDeleteModal(false);
  }, [isDeleting]);

  // Close delete modal on Escape key
  useEffect(() => {
    if (!showDeleteModal) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') closeDeleteModal();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showDeleteModal, closeDeleteModal]);

  const handleDeleteConfirm = useCallback(async () => {
    setIsDeleting(true);
    try {
      await deleteUrl(id);
      navigate('/app/links', {
        state: { successNotification: { shortUrl: buildShortUrl(link?.shortCode || ''), title: link?.title || 'Untitled Link' } },
      });
    } catch (err) {
      setNotification({ type: 'error', message: err.response?.data?.message || 'Failed to delete link' });
    } finally {
      setIsDeleting(false);
      setShowDeleteModal(false);
    }
  }, [id, navigate, link]);

  // Refetch analytics when user returns to the tab after clicking Open
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        refresh();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [refresh]);

  const chartData = useMemo(() => {
    if (!timeseries?.data?.length) return [];
    return timeseries.data.map(d => ({
      date: format(parseISO(d._id), timeseries.interval === 'hour' ? 'MMM d HH:mm' : 'MMM d'),
      clicks: d.clicks,
    }));
  }, [timeseries]);

  const breakdowns = useMemo(() => {
    if (!summary) return { sources: [], devices: [], browsers: [] };
    const makeItems = (arr) => {
      const sum = (arr || []).reduce((s, x) => s + x.clicks, 0);
      return (arr || []).map(d => ({ name: d.name, count: d.clicks, pct: pct(d.clicks, sum) }));
    };
    return {
      sources: makeItems(summary.topTrafficSources),
      devices: makeItems(summary.topDevices),
      browsers: makeItems(summary.topBrowsers),
    };
  }, [summary]);

  if (isLoading) return <LoadingSkeleton />;
  if (error) return <ErrorState message={error} onRetry={refresh} onBack={() => navigate('/app/links')} />;
  if (!link) return <NotFoundState onBack={() => navigate('/app/links')} />;

  const shortUrl = buildShortUrl(link.shortCode);
  const totalClicks = summary?.totalClicks ?? link.clickCount ?? 0;
  const hasAnalytics = totalClicks > 0;

  return (
    <div className="space-y-8">
      {notification && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-[8px] border text-sm animate-slide-in ${notification.type === 'success' ? 'bg-[#50CFA6]/10 border-[#50CFA6]/30 text-[#50CFA6]' : 'bg-[#F06B7A]/10 border-[#F06B7A]/30 text-[#F06B7A]'}`}>
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d={notification.type === 'success' ? 'M20 6L9 17l-5-5' : 'M12 9v2m0 4h.01'} />
          </svg>
          <span className="flex-1">{notification.message}</span>
          <button onClick={() => setNotification(null)} className="p-1 rounded hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F]" aria-label="Dismiss">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      {/* 1. LINK IDENTITY */}
      <section>
        <button onClick={() => navigate('/app/links')} className="group flex items-center gap-1.5 text-[12px] font-medium text-[#707A8A] hover:text-[#F2B95F] transition-colors mb-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] rounded-[4px]">
          <svg className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          Your links
        </button>
        <div className="mb-3">
          <span className="font-mono text-[32px] md:text-[40px] font-extrabold tracking-[-0.03em] text-[#F5F7FA] leading-none">{link.title || link.shortCode}</span>
        </div>
        <div className="flex items-center gap-3 flex-wrap mb-2">
          <code className="font-mono text-[15px] text-[#F2B95F] bg-[#1B202B] px-3 py-1.5 rounded-[6px] border border-[#2A313D]">{shortUrl}</code>
          <StatusBadge isActive={link.isActive} isExpired={link.isExpired} />
        </div>
        <a href={link.originalUrl} target="_blank" rel="noopener noreferrer" className="text-[13px] text-[#707A8A] hover:text-[#A8B0BD] transition-colors truncate block max-w-[640px] font-mono" title={link.originalUrl}>{link.originalUrl}</a>
        <div className="flex items-center gap-2 mt-5 flex-wrap">
          <button onClick={handleCopy} className="h-9 px-4 inline-flex items-center gap-2 rounded-[6px] bg-[#F2B95F] text-[#0E1117] text-[13px] font-semibold hover:bg-[#E4A744] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0E1117]">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
            Copy
          </button>
          <button onClick={handleOpen} className="h-9 px-4 inline-flex items-center gap-2 rounded-[6px] bg-[#1B202B] border border-[#2A313D] text-[13px] font-medium text-[#A8B0BD] hover:text-[#F5F7FA] hover:border-[#3A414D] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0E1117]">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
            Open
          </button>
          <button onClick={() => navigate(`/app/links/${id}/edit`)} className="h-9 px-4 inline-flex items-center gap-2 rounded-[6px] bg-[#1B202B] border border-[#2A313D] text-[13px] font-medium text-[#A8B0BD] hover:text-[#F5F7FA] hover:border-[#3A414D] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0E1117]">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" strokeLinecap="round" strokeLinejoin="round" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Edit
          </button>
          <button onClick={() => setShowDeleteModal(true)} className="h-9 px-4 inline-flex items-center gap-2 rounded-[6px] bg-[#F06B7A]/10 border border-[#F06B7A]/20 text-[13px] font-medium text-[#F06B7A] hover:bg-[#F06B7A]/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F06B7A] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0E1117]">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6" strokeLinecap="round" strokeLinejoin="round" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Delete
          </button>
        </div>
      </section>

      <div className="border-t border-[#2A313D]" />

      {/* 2. PERFORMANCE */}
      <section>
        <div className="flex items-end justify-between flex-wrap gap-4 mb-6">
          <div>
            <p className="text-[10px] font-mono font-semibold tracking-[0.14em] uppercase text-[#707A8A] mb-1">Total Clicks</p>
            <p className="text-[48px] md:text-[56px] font-extrabold tracking-[-0.04em] text-[#F5F7FA] leading-none tabular-nums">{formatNumber(totalClicks)}</p>
          </div>
          <div className="flex items-center gap-1.5">
            {DATE_RANGE_OPTIONS.map(opt => (
              <button key={opt.value} onClick={() => handleRangeChange(opt.value)} className={`h-8 px-3 rounded-[6px] text-[11px] font-semibold tracking-wide uppercase transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0E1117] ${selectedRange === opt.value ? 'bg-[#F2B95F] text-[#0E1117]' : 'bg-[#1B202B] border border-[#2A313D] text-[#707A8A] hover:text-[#F5F7FA] hover:border-[#3A414D]'}`}>{opt.label}</button>
            ))}
          </div>
        </div>
      </section>

      {/* 3. CLICK ACTIVITY */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <span className="text-[10px] font-mono font-semibold tracking-[0.14em] uppercase text-[#707A8A]">Click Activity</span>
          {timeseries?.interval && <span className="text-[10px] font-mono tracking-wider text-[#2A313D] uppercase">&middot; {timeseries.interval}</span>}
        </div>
        {hasAnalytics && chartData.length > 0 ? (
          <div className="relative overflow-hidden bg-[#0F141D] border border-[#2A313D] rounded-[8px] p-3 h-[240px] sm:h-[280px] lg:h-[300px]">
            <SparklineChart data={chartData} label="Click activity" />
          </div>
        ) : (
          <div className="bg-[#151922] border border-[#2A313D] rounded-[10px] p-10 text-center">
            <div className="w-10 h-10 rounded-full bg-[#1B202B] border border-[#2A313D] flex items-center justify-center mx-auto mb-3">
              <svg className="w-5 h-5 text-[#707A8A]" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18M7 16l4-8 4 4 4-10" /></svg>
            </div>
            <p className="text-[#F5F7FA] text-sm font-semibold mb-1">No clicks yet</p>
            <p className="text-[#707A8A] text-[13px]">Your link hasn't received any clicks during this period.</p>
          </div>
        )}
      </section>

      {/* 4. TRAFFIC & AUDIENCE */}
      <section>
        <div className="mb-4">
          <span className="text-[10px] font-mono font-semibold tracking-[0.14em] uppercase text-[#707A8A]">Traffic &amp; Audience</span>
          <p className="text-[11px] text-[#707A8A] mt-1">Based on tracked clicks</p>
        </div>
        {breakdowns.sources.length === 0 && breakdowns.devices.length === 0 && breakdowns.browsers.length === 0 ? (
          <div className="bg-[#151922] border border-[#2A313D] rounded-[10px] p-10 text-center">
            <p className="text-[#F5F7FA] text-sm font-semibold mb-1">No tracked analytics yet</p>
            <p className="text-[#707A8A] text-[13px]">Analytics will appear after your link receives tracked clicks.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Row 1: Traffic Sources + Devices side by side */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Traffic Sources */}
              <div className="bg-[#151922] border border-[#2A313D] rounded-[10px] p-5">
                <p className="text-[10px] font-mono font-semibold tracking-[0.14em] uppercase text-[#707A8A] mb-4">Traffic Sources</p>
                {breakdowns.sources.length > 0 ? (
                  <div className="space-y-3">
                    {breakdowns.sources.map((item, i) => (
                      <div key={i}>
                        <div className="flex items-center justify-between gap-3 mb-1.5">
                          <span className="text-[13px] text-[#A8B0BD] truncate" title={item.name}>{item.name}</span>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[11px] font-mono text-[#707A8A] tabular-nums">{numberFormat.format(item.count)} clicks</span>
                            <span className="text-[11px] font-mono font-medium text-[#F5F7FA] w-10 text-right tabular-nums">{item.pct}%</span>
                          </div>
                        </div>
                        <div className="h-1.5 rounded-full bg-[#1B202B] overflow-hidden">
                          <div className="h-full rounded-full bg-[#F2B95F] transition-all duration-500" style={{ width: `${item.pct}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[13px] text-[#707A8A]">No tracked traffic yet</p>
                )}
              </div>

              {/* Devices */}
              <div className="bg-[#151922] border border-[#2A313D] rounded-[10px] p-5">
                <p className="text-[10px] font-mono font-semibold tracking-[0.14em] uppercase text-[#707A8A] mb-4">Devices</p>
                {breakdowns.devices.length > 0 ? (
                  <div className="space-y-3">
                    {breakdowns.devices.map((item, i) => (
                      <div key={i}>
                        <div className="flex items-center justify-between gap-3 mb-1.5">
                          <span className="text-[13px] text-[#A8B0BD] truncate" title={item.name}>{item.name}</span>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[11px] font-mono text-[#707A8A] tabular-nums">{numberFormat.format(item.count)} clicks</span>
                            <span className="text-[11px] font-mono font-medium text-[#F5F7FA] w-10 text-right tabular-nums">{item.pct}%</span>
                          </div>
                        </div>
                        <div className="h-1.5 rounded-full bg-[#1B202B] overflow-hidden">
                          <div className="h-full rounded-full bg-[#F2B95F] transition-all duration-500" style={{ width: `${item.pct}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[13px] text-[#707A8A]">No tracked devices yet</p>
                )}
              </div>
            </div>

            {/* Row 2: Browsers full width */}
            <div className="bg-[#151922] border border-[#2A313D] rounded-[10px] p-5">
              <p className="text-[10px] font-mono font-semibold tracking-[0.14em] uppercase text-[#707A8A] mb-4">Browsers</p>
              {breakdowns.browsers.length > 0 ? (
                <div className="space-y-3">
                  {breakdowns.browsers.map((item, i) => (
                    <div key={i}>
                      <div className="flex items-center justify-between gap-3 mb-1.5">
                        <span className="text-[13px] text-[#A8B0BD] truncate" title={item.name}>{item.name}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[11px] font-mono text-[#707A8A] tabular-nums">{numberFormat.format(item.count)} clicks</span>
                          <span className="text-[11px] font-mono font-medium text-[#F5F7FA] w-10 text-right tabular-nums">{item.pct}%</span>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full bg-[#1B202B] overflow-hidden">
                        <div className="h-full rounded-full bg-[#F2B95F] transition-all duration-500" style={{ width: `${item.pct}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[13px] text-[#707A8A]">No tracked browsers yet</p>
              )}
            </div>
          </div>
        )}
      </section>

      {/* 5. LINK METADATA */}
      <section>
        <span className="text-[10px] font-mono font-semibold tracking-[0.14em] uppercase text-[#707A8A] mb-4 block">Details</span>
        <div className="bg-[#151922] border border-[#2A313D] rounded-[10px] p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4">
            {[
              { label: 'Short Code', value: link.shortCode, mono: true },
              link.title && { label: 'Title', value: link.title },
              link.description && { label: 'Description', value: link.description },
              { label: 'Created', value: format(new Date(link.createdAt), 'MMM d, yyyy') },
              { label: 'Updated', value: format(new Date(link.updatedAt), 'MMM d, yyyy') },
              link.expiresAt && { label: 'Expires', value: format(new Date(link.expiresAt), 'MMM d, yyyy') },
              { label: 'Status', value: (!link.isActive || link.isExpired) ? 'Inactive' : 'Active' },
            ].filter(Boolean).map(({ label, value, mono }) => (
              <div key={label}>
                <p className="text-[10px] font-mono font-semibold tracking-[0.12em] uppercase text-[#707A8A] mb-1">{label}</p>
                <p className={`text-[13px] text-[#A8B0BD] truncate ${mono ? 'font-mono' : ''}`} title={value}>{value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* DELETE MODAL */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0E1117]/80 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="ld-delete-title" aria-describedby="ld-delete-desc" onClick={closeDeleteModal}>
          <div className="w-full max-w-md bg-[#151922] border border-[#2A313D] rounded-[10px] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-[#2A313D]"><h2 id="ld-delete-title" className="text-[#F5F7FA] text-lg font-semibold">Delete link</h2></div>
            <div className="px-6 py-5">
              <p id="ld-delete-desc" className="text-[#A8B0BD] text-[13px] leading-relaxed">Are you sure you want to delete <code className="text-[#F2B95F] font-mono bg-[#1B202B] px-1.5 py-0.5 rounded-[4px] border border-[#2A313D]">{shortUrl}</code>? This action cannot be undone.</p>
            </div>
            <div className="px-6 py-4 border-t border-[#2A313D] bg-[#1B202B]/40 flex justify-end gap-3">
              <button onClick={() => setShowDeleteModal(false)} disabled={isDeleting} className="h-10 px-4 rounded-[6px] bg-[#1B202B] border border-[#2A313D] text-[13px] font-medium text-[#A8B0BD] hover:text-[#F5F7FA] transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0E1117]">Cancel</button>
              <button onClick={handleDeleteConfirm} disabled={isDeleting} className="h-10 px-4 inline-flex items-center gap-2 rounded-[6px] bg-[#F06B7A] text-[#0E1117] text-[13px] font-semibold hover:bg-[#F06B7A]/90 transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F06B7A] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0E1117]">
                {isDeleting && <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.25" /><path d="M12 2a10 10 0 0110 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /></svg>}
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
