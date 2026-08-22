import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useOverview } from '../hooks/useOverview';

const numberFormat = new Intl.NumberFormat('en-US');

function getGreeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function getFirstName(user) {
  const name = user?.name?.trim();
  if (name) {
    const first = name.split(/\s+/)[0];
    return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
  }
  const email = user?.email?.trim();
  if (email) return email.split('@')[0];
  return 'there';
}

function StatusBadge({ isActive }) {
  return isActive ? (
    <span className="inline-flex items-center px-2 py-0.5 rounded-[4px] text-[10px] font-mono font-medium tracking-[0.1em] uppercase bg-[#50CFA6]/15 text-[#50CFA6]">
      Active
    </span>
  ) : (
    <span className="inline-flex items-center px-2 py-0.5 rounded-[4px] text-[10px] font-mono font-medium tracking-[0.1em] uppercase bg-[#F06B7A]/15 text-[#F06B7A]">
      Inactive
    </span>
  );
}

function StatCard({ label, value, dotColor }) {
  return (
    <div className="rounded-[14px] border border-[#2A313D] bg-[#151922] p-5 md:p-6">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: dotColor }} aria-hidden="true" />
        <span className="text-[10px] font-mono font-semibold tracking-[0.14em] uppercase text-[#707A8A]">{label}</span>
      </div>
      <div className="font-mono text-[32px] md:text-[36px] font-bold tabular-nums text-[#F5F7FA] leading-none">
        {numberFormat.format(value)}
      </div>
    </div>
  );
}
function StatCardSkeleton() {
  return (
    <div className="rounded-[14px] border border-[#2A313D] bg-[#151922] p-5 md:p-6">
      <div className="h-2.5 w-20 rounded bg-[#2A313D] animate-pulse mb-4" />
      <div className="h-8 w-16 rounded bg-[#2A313D] animate-pulse" />
    </div>
  );
}

function RecentRowSkeleton() {
  return (
    <div className="flex items-center justify-between gap-4 px-5 md:px-6 py-4">
      <div className="min-w-0 flex-1">
        <div className="h-3 w-24 rounded bg-[#2A313D] animate-pulse mb-2" />
        <div className="h-2.5 w-40 rounded bg-[#2A313D] animate-pulse" />
      </div>
      <div className="h-3 w-16 rounded bg-[#2A313D] animate-pulse" />
    </div>
  );
}

function RecentRow({ link }) {
  return (
    <Link
      to={`/app/links/${link.id}`}
      className="flex items-center justify-between gap-4 px-5 md:px-6 py-4 hover:bg-[#1B202B]/50 transition-colors focus-visible:outline-none focus-visible:bg-[#1B202B]/50"
    >
      <div className="min-w-0">
        <code className="text-[13px] font-mono text-[#F2B95F]">/{link.shortCode}</code>
        <p className="text-[13px] text-[#A8B0BD] truncate mt-0.5 max-w-[420px]">
          {link.title || link.originalUrl}
        </p>
      </div>
      <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0">
        <span className="text-[12px] font-mono tabular-nums text-[#A8B0BD] whitespace-nowrap">
          {numberFormat.format(link.clickCount || 0)} clicks
        </span>
        <StatusBadge isActive={link.isActive} />
      </div>
    </Link>
  );
}

function CreateLinkButton({ label = 'Create link' }) {
  return (
    <Link
      to="/app/links/new"
      className="h-10 px-5 inline-flex items-center justify-center gap-2 rounded-[6px] bg-[#F2B95F] text-[#0E1117] font-semibold text-[13px] hover:bg-[#E4A744] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0E1117] whitespace-nowrap"
    >
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
        <path d="M12 5v14M5 12h14" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {label}
    </Link>
  );
}
function SectionHeader({ label, action }) {
  return (
    <div className="px-5 md:px-6 py-4 border-b border-[#2A313D] bg-[#1B202B]/40 flex items-center justify-between gap-3">
      <span className="text-[11px] font-mono font-bold tracking-[0.14em] uppercase text-[#F5F7FA] flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-[#F2B95F]" aria-hidden="true" />
        {label}
      </span>
      {action}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-[14px] border border-[#2A313D] bg-[#151922] p-10 md:p-14 flex flex-col items-center justify-center text-center">
      <div className="w-12 h-12 rounded-full bg-[#1B202B] border border-[#2A313D] flex items-center justify-center mb-5">
        <svg className="w-5 h-5 text-[#707A8A]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-4.686a4.5 4.5 0 00-1.242-7.244l4.5-4.5a4.5 4.5 0 016.364 6.364l-1.757 1.757" />
        </svg>
      </div>
      <h3 className="text-[18px] font-semibold text-[#F5F7FA] mb-2">No links yet</h3>
      <p className="text-[14px] text-[#A8B0BD] max-w-[360px] leading-[1.6] mb-6">
        Create your first short link to start building your LinkSphere workspace.
      </p>
      <CreateLinkButton label="Create your first link" />
    </div>
  );
}

function ErrorState({ message, onRetry }) {
  return (
    <div className="rounded-[14px] border border-[#F06B7A]/30 bg-[#F06B7A]/10 p-6 flex items-start gap-3" role="alert">
      <svg className="w-5 h-5 text-[#F06B7A] mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4M12 16h.01" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="flex-1">
        <p className="text-sm font-medium text-[#F06B7A]">Couldn't load your workspace</p>
        <p className="text-[13px] text-[#A8B0BD] mt-1">{message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 h-9 px-4 inline-flex items-center rounded-[6px] bg-[#1B202B] border border-[#2A313D] text-[13px] font-medium text-[#A8B0BD] hover:bg-[#222936] hover:text-[#F5F7FA] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0E1117]"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
export default function OverviewPage() {
  const { user } = useAuth();
  const { stats, recentLinks, topPerformingLink, isLoading, error, retry } = useOverview();

  const isEmpty = !isLoading && !error && stats.totalLinks === 0;

  return (
    <div className="w-full max-w-[1200px] mx-auto animate-slide-in">
      {/* Welcome header */}
      <div className="mb-10">
        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#151922] border border-[#2A313D] text-[10px] font-mono font-semibold tracking-[0.14em] uppercase text-[#707A8A] mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-[#50CFA6]" aria-hidden="true" />
          Overview
        </div>

        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="text-[28px] md:text-[34px] font-extrabold tracking-[-0.03em] leading-[1.1] mb-2 text-[#F5F7FA]">
              {getGreeting()}, {getFirstName(user)}.
            </h1>
            <p className="text-[15px] md:text-[16px] text-[#A8B0BD] leading-[1.6]">
              Manage your links and see how they're performing.
            </p>
          </div>
          <div className="flex-shrink-0">
            <CreateLinkButton />
          </div>
        </div>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={retry} />
      ) : isEmpty ? (
        <EmptyState />
      ) : (
        <div className="space-y-8">
          {/* Quick stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {isLoading ? (
              <>
                <StatCardSkeleton />
                <StatCardSkeleton />
                <StatCardSkeleton />
                <StatCardSkeleton />
              </>
            ) : (
              <>
                <StatCard label="Total links" value={stats.totalLinks} dotColor="#F2B95F" />
                <StatCard label="Active" value={stats.activeLinks} dotColor="#50CFA6" />
                <StatCard label="Inactive" value={stats.inactiveLinks} dotColor="#707A8A" />
                <StatCard label="Total clicks" value={stats.totalClicks} dotColor="#F2B95F" />
              </>
            )}
          </div>

          {/* Top performing link */}
          {!isLoading && topPerformingLink && (
            <Link
              to={`/app/links/${topPerformingLink.id}`}
              className="group block rounded-[14px] border border-[#2A313D] bg-[#151922] border-l-[3px] border-l-[#F2B95F] overflow-hidden transition-colors hover:bg-[#1B202B]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0E1117]"
            >
              <div className="px-5 md:px-6 py-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#F2B95F]" aria-hidden="true" />
                  <span className="text-[10px] font-mono font-semibold tracking-[0.14em] uppercase text-[#707A8A]">Top performing link</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <code className="text-[16px] font-mono font-bold text-[#F2B95F]">/{topPerformingLink.shortCode}</code>
                    {topPerformingLink.title && (
                      <p className="text-[13px] text-[#A8B0BD] mt-1 truncate max-w-[420px]">
                        {topPerformingLink.title}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0">
                    <span className="text-[15px] font-mono font-bold tabular-nums text-[#F5F7FA]">
                      {numberFormat.format(topPerformingLink.clickCount || 0)} clicks
                    </span>
                    <StatusBadge isActive={topPerformingLink.isActive} />
                    <span className="text-[12px] text-[#F2B95F] inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      View analytics
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                        <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          )}

          {/* Recent links */}
          <div className="rounded-[14px] border border-[#2A313D] bg-[#151922] overflow-hidden">
            <SectionHeader
              label="Recent links"
              action={
                <Link
                  to="/app/links"
                  className="text-[12px] font-medium text-[#F2B95F] hover:text-[#E4A744] transition-colors inline-flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] rounded-[4px]"
                >
                  View all
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                    <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
              }
            />
            <div className="divide-y divide-[#2A313D]/60">
              {isLoading ? (
                <>
                  <RecentRowSkeleton />
                  <RecentRowSkeleton />
                  <RecentRowSkeleton />
                </>
              ) : (
                recentLinks.map((link) => <RecentRow key={link.id} link={link} />)
              )}
            </div>
          </div>

          {/* Quick actions */}
          <div className="flex items-center gap-4 text-[13px]">
            <Link
              to="/app/links/new"
              className="inline-flex items-center gap-2 text-[#A8B0BD] hover:text-[#F2B95F] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] rounded-[4px]"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M12 5v14M5 12h14" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Create a new link
            </Link>
            <span className="text-[#2A313D]" aria-hidden="true">·</span>
            <Link
              to="/app/links"
              className="inline-flex items-center gap-2 text-[#A8B0BD] hover:text-[#F2B95F] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] rounded-[4px]"
            >
              View all links
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}



