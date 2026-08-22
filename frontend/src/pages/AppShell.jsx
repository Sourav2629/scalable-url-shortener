import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Outlet, useLocation } from 'react-router-dom';
import Logo from '../components/brand/Logo';

const navItems = [
  { path: '/app', label: 'Overview' },
  { path: '/app/links', label: 'Links' },
];

export default function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  const isActive = (path) => {
    if (path === '/app') return location.pathname === '/app';
    return location.pathname.startsWith(path);
  };

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  // Close mobile menu on Escape
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setMobileMenuOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen]);

  return (
    <div className="min-h-screen bg-[#0E1117] text-[#F5F7FA]">
      {/* Authenticated header */}
      <header className="w-full bg-[#0E1117]/95 backdrop-blur border-b border-[#2A313D] sticky top-0 z-50">
        <div className="w-full max-w-[1440px] mx-auto px-5 md:px-6 lg:px-8 h-[72px] flex items-center justify-between">
          <div className="flex items-center gap-6">
            <a href="/app" className="flex items-center min-w-0" aria-label="LinkSphere dashboard">
              <div className="md:hidden">
                <Logo markOnly className="w-8 h-8" />
              </div>
              <div className="hidden md:block">
                <Logo className="w-8 h-8" />
              </div>
            </a>

            {/* Desktop nav tabs */}
            <nav className="hidden md:flex items-center gap-1" aria-label="Authenticated navigation">
              {navItems.map((item) => {
                const active = isActive(item.path);
                return (
                  <button
                    key={item.path}
                    type="button"
                    onClick={() => navigate(item.path)}
                    className={`h-9 px-4 inline-flex items-center rounded-[6px] text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0E1117] ${
                      active
                        ? 'text-[#F5F7FA]'
                        : 'text-[#707A8A] hover:text-[#A8B0BD]'
                    }`}
                    aria-current={active ? 'page' : undefined}
                  >
                    {item.label}
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-4">
            {/* User indicator — desktop only */}
            <div className="hidden md:flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-[#1B202B] border border-[#2A313D] flex items-center justify-center text-xs font-bold text-[#F2B95F]">
                {user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'U'}
              </div>
              <span className="text-sm text-[#A8B0BD] font-medium max-w-[160px] truncate">
                {user?.name || user?.email || 'User'}
              </span>
            </div>

            {/* Mobile menu button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="md:hidden p-2 rounded-[6px] text-[#A8B0BD] hover:bg-[#1B202B] hover:text-[#F5F7FA] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F]"
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? (
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" /></svg>
              ) : (
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M3 12h18M3 6h18M3 18h18" strokeLinecap="round" /></svg>
              )}
            </button>

            {/* Desktop logout */}
            <button
              type="button"
              onClick={handleLogout}
              className="hidden md:inline-flex h-9 px-3 items-center rounded-[6px] text-[12px] font-medium text-[#A8B0BD] hover:bg-[#1B202B] hover:text-[#F5F7FA] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0E1117] cursor-pointer"
            >
              Logout
            </button>
          </div>
        </div>

        {/* Mobile menu dropdown */}
        {mobileMenuOpen && (
          <nav className="md:hidden border-t border-[#2A313D] bg-[#0E1117] px-5 py-3" aria-label="Authenticated navigation">
            {navItems.map((item) => {
              const active = isActive(item.path);
              return (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => {
                    navigate(item.path);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full h-10 px-4 inline-flex items-center rounded-[6px] text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] ${
                    active
                      ? 'text-[#F5F7FA] bg-[#1B202B]'
                      : 'text-[#707A8A] hover:text-[#A8B0BD]'
                  }`}
                  aria-current={active ? 'page' : undefined}
                >
                  {item.label}
                </button>
              );
            })}
            <div className="border-t border-[#2A313D] mt-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  handleLogout();
                }}
                className="w-full h-10 px-4 inline-flex items-center rounded-[6px] text-[13px] font-medium text-[#F06B7A] hover:bg-[#F06B7A]/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F]"
              >
                Logout
              </button>
            </div>
          </nav>
        )}
      </header>

      {/* Main content - nested routes render here */}
      <main className="w-full max-w-[1440px] mx-auto px-5 md:px-6 lg:px-8 py-12 md:py-16">
        <Outlet />
      </main>
    </div>
  );
}