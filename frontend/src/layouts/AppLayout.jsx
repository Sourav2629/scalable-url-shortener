import { useAuth } from '../context/AuthContext';
import { useNavigate, Outlet, useLocation } from 'react-router-dom';
import Logo from '../components/brand/Logo';

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  const navItems = [
    { path: '/app', label: 'Links', icon: 'link' },
    { path: '/app/analytics', label: 'Analytics', icon: 'analytics', disabled: true },
  ];

  const isActive = (path) => location.pathname === path || (path !== '/app' && location.pathname.startsWith(path));

  return (
    <div className="min-h-screen bg-[#0E1117] text-[#F5F7FA] flex flex-col">
      {/* Authenticated header */}
      <header className="w-full bg-[#0E1117]/95 backdrop-blur border-b border-[#2A313D] sticky top-0 z-50">
        <div className="w-full max-w-[1440px] mx-auto px-5 md:px-6 lg:px-8 h-[72px] flex items-center justify-between">
          {/* Logo / Brand */}
          <a href="/app" className="flex items-center min-w-0" aria-label="LinkSphere dashboard">
            <div className="md:hidden">
              <Logo markOnly className="w-8 h-8" />
            </div>
            <div className="hidden md:block">
              <Logo className="w-8 h-8" />
            </div>
          </a>

          {/* Navigation */}
          <nav className="hidden md:flex items-center gap-1" aria-label="Main navigation">
            {navItems.map((item) => (
              <button
                key={item.path}
                type="button"
                onClick={() => !item.disabled && navigate(item.path)}
                disabled={item.disabled}
                className={`h-10 px-4 inline-flex items-center gap-2 rounded-[6px] text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0E1117] ${
                  isActive(item.path)
                    ? 'bg-[#1B202B] text-[#F5F7FA]'
                    : 'text-[#A8B0BD] hover:bg-[#1B202B] hover:text-[#F5F7FA]'
                } ${item.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                aria-current={isActive(item.path) ? 'page' : undefined}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* User actions */}
          <div className="flex items-center gap-3">
            {/* User menu */}
            <div className="relative">
              <button
                type="button"
                id="user-menu-button"
                aria-expanded="false"
                aria-haspopup="true"
                className="flex items-center gap-2.5 h-9 px-3 rounded-[6px] bg-[#1B202B] border border-[#2A313D] text-[#F5F7FA] hover:bg-[#222936] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0E1117] cursor-pointer"
              >
                <div className="w-8 h-8 rounded-full bg-[#1B202B] border border-[#2A313D] flex items-center justify-center text-xs font-bold text-[#F2B95F]">
                  {user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'U'}
                </div>
                <span className="hidden sm:block text-sm font-medium max-w-[160px] truncate">
                  {user?.name || user?.email || 'User'}
                </span>
                <svg className="w-4 h-4 text-[#707A8A]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {/* Dropdown menu */}
              <div
                className="absolute right-0 mt-2 w-48 bg-[#151922] border border-[#2A313D] rounded-[10px] shadow-[0_8px_30px_rgba(0,0,0,0.4)] py-1.5 z-50 animate-fade-in"
                role="menu"
                aria-labelledby="user-menu-button"
              >
                <div className="px-3 py-2 border-b border-[#2A313D]">
                  <p className="text-xs font-medium text-[#F5F7FA] truncate">{user?.name || user?.email || 'User'}</p>
                  <p className="text-[10px] text-[#707A8A] truncate font-mono">{user?.email}</p>
                </div>
                <button
                  type="button"
                  role="menuitem"
                  className="w-full px-3 py-2 text-left text-sm text-[#A8B0BD] hover:bg-[#1B202B] hover:text-[#F5F7FA] transition-colors"
                >
                  Profile
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="w-full px-3 py-2 text-left text-sm text-[#A8B0BD] hover:bg-[#1B202B] hover:text-[#F5F7FA] transition-colors"
                >
                  Settings
                </button>
                <hr className="my-1.5 border-[#2A313D]" />
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleLogout}
                  className="w-full px-3 py-2 text-left text-sm text-[#F06A7A] hover:bg-[#1B202B] transition-colors"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 w-full max-w-[1440px] mx-auto px-5 md:px-6 lg:px-8 py-8 md:py-12">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="w-full bg-[#0E1117] border-t border-[#2A313D] py-6">
        <div className="w-full max-w-[1440px] mx-auto px-5 md:px-6 lg:px-8">
          <p className="text-center text-[11px] font-mono tracking-[0.14em] uppercase text-[#707A8A]">
            LinkSphere — Fast, Clean URL Shortener
          </p>
        </div>
      </footer>
    </div>
  );
}