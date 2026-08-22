import { useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
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

function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return String(num);
}

function pct(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

function StatusBadge({ isActive }) {
  return isActive
    ? <span className="inline-flex items-center px-2 py-0.5 rounded-[4px] text-[10px] font-mono font-medium tracking-[0.1em] uppercase bg-[#50CFA6]/15 text-[#50CFA6]">Active</span>
    : <span className="inline-flex items-center px-2 py-0.5 rounded-[4px] text-[10px] font-mono font-medium tracking-[0.1em] uppercase bg-[#F06B7A]/15 text-[#F06B7A]">Inactive</span>;
}

function Bar({ value, max }) {
  const w = max ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div className="h-2 rounded-full bg-[#1B202B] overflow-hidden w-full">
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${w}%`, backgroundColor: '#F2B95F' }} />
    </div>
  );
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
        <button onClick={onBack} className="h-9 px-4 rounded-[6px] bg-[#1B202B] border border-[#2A313D] text-[13px] font-medium text-[#A8B0BD] hover:text-[#F5F7FA] transition-colors">Back to Links</button>
        <button onClick={onRetry} className="h-9 px-4 rounded-[6px] bg-[#F2B95F] text-[#0E1117] text-[13px] font-semibold hover:bg-[#E4A744] transition-colors">Try Again</button>
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
      <button onClick={onBack} className="h-9 px-5 rounded-[6px] bg-[#F2B95F] text-[#0E1117] text-[13px] font-semibold hover:bg-[#E4A744] transition-colors">Back to Links</button>
    </div>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#1B202B] border border-[#2A313D] rounded-[6px] px-3 py-2 text-xs">
      <p className="text-[#707A8A] font-mono mb-1">{label}</p>
      <p className="text-[#F5F7FA] font-semibold">{payload[0].value.toLocaleString()} clicks</p>
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

  const handleDeleteConfirm = useCallback(async () => {
    setIsDeleting(true);
    try {
      await deleteUrl(id);
      navigate('/app', {
        state: { successNotification: { shortUrl: buildShortUrl(link?.shortCode || ''), title: link?.title || 'Untitled Link' } },
      });
    } catch (err) {
      setNotification({ type: 'error', message: err.response?.data?.error?.message || 'Failed to delete link' });
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
    if (!summary) return [];
    return [
      { title: 'Traffic Sources', items: (summary.topTrafficSources || []).map(d => ({ name: d.name, count: d.clicks, pct: pct(d.clicks, (summary.topTrafficSources || []).reduce((s, x) => s + x.clicks, 0)) })) },
      { title: 'Devices', items: (summary.topDevices || []).map(d => ({ name: d.name, count: d.clicks, pct: pct(d.clicks, (summary.topDevices || []).reduce((s, x) => s + x.clicks, 0)) })) },
      { title: 'Browsers', items: (summary.topBrowsers || []).map(d => ({ name: d.name, count: d.clicks, pct: pct(d.clicks, (summary.topBrowsers || []).reduce((s, x) => s + x.clicks, 0)) })) },
      { title: 'Operating Systems', items: (summary.topOperatingSystems || []).map(d => ({ name: d.name, count: d.clicks, pct: pct(d.clicks, (summary.topOperatingSystems || []).reduce((s, x) => s + x.clicks, 0)) })) },
    ];
  }, [summary]);

  if (isLoading) return <LoadingSkeleton />;
  if (error) return <ErrorState message={error} onRetry={refresh} onBack={() => navigate('/app')} />;
  if (!link) return <NotFoundState onBack={() => navigate('/app')} />;

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
          <button onClick={() => setNotification(null)} className="p-1 rounded hover:bg-white/5 transition-colors" aria-label="Dismiss">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      {/* 1. LINK IDENTITY */}
      <section>
        <button onClick={() => navigate('/app')} className="group flex items-center gap-1.5 text-[12px] font-medium text-[#707A8A] hover:text-[#F2B95F] transition-colors mb-5">
          <svg className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          Your links
        </button>
        <div className="mb-3">
          <span className="font-mono text-[32px] md:text-[40px] font-extrabold tracking-[-0.03em] text-[#F5F7FA] leading-none">{link.title || link.shortCode}</span>
        </div>
        <div className="flex items-center gap-3 flex-wrap mb-2">
          <code className="font-mono text-[15px] text-[#F2B95F] bg-[#1B202B] px-3 py-1.5 rounded-[6px] border border-[#2A313D]">{shortUrl}</code>
          <StatusBadge isActive={link.isActive} />
        </div>
        <a href={link.originalUrl} target="_blank" rel="noopener noreferrer" className="text-[13px] text-[#707A8A] hover:text-[#A8B0BD] transition-colors truncate block max-w-[640px] font-mono" title={link.originalUrl}>{link.originalUrl}</a>
        <div className="flex items-center gap-2 mt-5 flex-wrap">
          <button onClick={handleCopy} className="h-9 px-4 inline-flex items-center gap-2 rounded-[6px] bg-[#F2B95F] text-[#0E1117] text-[13px] font-semibold hover:bg-[#E4A744] transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
            Copy
          </button>
          <button onClick={handleOpen} className="h-9 px-4 inline-flex items-center gap-2 rounded-[6px] bg-[#1B202B] border border-[#2A313D] text-[13px] font-medium text-[#A8B0BD] hover:text-[#F5F7FA] hover:border-[#3A414D] transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
            Open
          </button>
          <button onClick={() => navigate(`/app/links/${id}/edit`)} className="h-9 px-4 inline-flex items-center gap-2 rounded-[6px] bg-[#1B202B] border border-[#2A313D] text-[13px] font-medium text-[#A8B0BD] hover:text-[#F5F7FA] hover:border-[#3A414D] transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" strokeLinecap="round" strokeLinejoin="round" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Edit
          </button>
          <button onClick={() => setShowDeleteModal(true)} className="h-9 px-4 inline-flex items-center gap-2 rounded-[6px] bg-[#F06B7A]/10 border border-[#F06B7A]/20 text-[13px] font-medium text-[#F06B7A] hover:bg-[#F06B7A]/20 transition-colors">
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
              <button key={opt.value} onClick={() => handleRangeChange(opt.value)} className={`h-8 px-3 rounded-[6px] text-[11px] font-semibold tracking-wide uppercase transition-colors ${selectedRange === opt.value ? 'bg-[#F2B95F] text-[#0E1117]' : 'bg-[#1B202B] border border-[#2A313D] text-[#707A8A] hover:text-[#F5F7FA] hover:border-[#3A414D]'}`}>{opt.label}</button>
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
          <div className="bg-[#151922] border border-[#2A313D] rounded-[10px] p-5 md:p-6">
            <div className="h-64 md:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1B202B" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: '#707A8A', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }} axisLine={{ stroke: '#2A313D' }} tickLine={false} interval={Math.max(0, Math.floor(chartData.length / 7))} />
                  <YAxis tick={{ fill: '#707A8A', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }} axisLine={false} tickLine={false} tickFormatter={formatNumber} width={40} />
                  <Tooltip content={<ChartTooltip />} />
                  <Line type="monotone" dataKey="clicks" stroke="#F2B95F" strokeWidth={2} dot={false} activeDot={{ r: 5, fill: '#F2B95F', stroke: '#0E1117', strokeWidth: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
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
        <span className="text-[10px] font-mono font-semibold tracking-[0.14em] uppercase text-[#707A8A] mb-4 block">Traffic &amp; Audience</span>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {breakdowns.map(({ title, items }) => (
            <div key={title} className="bg-[#151922] border border-[#2A313D] rounded-[10px] p-5">
              <p className="text-[10px] font-mono font-semibold tracking-[0.14em] uppercase text-[#707A8A] mb-4">{title}</p>
              {items.length > 0 ? (
                <div className="space-y-3">
                  {items.map((item, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-[13px] text-[#A8B0BD] w-[120px] md:w-[140px] truncate shrink-0" title={item.name}>{item.name}</span>
                      <div className="flex-1 min-w-0"><Bar value={item.count} max={items[0]?.count || 1} /></div>
                      <span className="text-[11px] font-mono text-[#707A8A] w-10 text-right tabular-nums shrink-0">{item.pct}%</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[13px] text-[#707A8A]">No data yet</p>
              )}
            </div>
          ))}
        </div>
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
              { label: 'Status', value: link.isActive ? 'Active' : 'Inactive' },
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0E1117]/80 backdrop-blur-sm" onClick={() => !isDeleting && setShowDeleteModal(false)}>
          <div className="w-full max-w-md bg-[#151922] border border-[#2A313D] rounded-[10px] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-[#2A313D]"><h2 className="text-[#F5F7FA] text-lg font-semibold">Delete link</h2></div>
            <div className="px-6 py-5">
              <p className="text-[#A8B0BD] text-[13px] leading-relaxed">Are you sure you want to delete <code className="text-[#F2B95F] font-mono bg-[#1B202B] px-1.5 py-0.5 rounded-[4px] border border-[#2A313D]">{shortUrl}</code>? This action cannot be undone.</p>
            </div>
            <div className="px-6 py-4 border-t border-[#2A313D] bg-[#1B202B]/40 flex justify-end gap-3">
              <button onClick={() => setShowDeleteModal(false)} disabled={isDeleting} className="h-10 px-4 rounded-[6px] bg-[#1B202B] border border-[#2A313D] text-[13px] font-medium text-[#A8B0BD] hover:text-[#F5F7FA] transition-colors disabled:opacity-50">Cancel</button>
              <button onClick={handleDeleteConfirm} disabled={isDeleting} className="h-10 px-4 inline-flex items-center gap-2 rounded-[6px] bg-[#F06B7A] text-[#0E1117] text-[13px] font-semibold hover:bg-[#F06B7A]/90 transition-colors disabled:opacity-50">
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
