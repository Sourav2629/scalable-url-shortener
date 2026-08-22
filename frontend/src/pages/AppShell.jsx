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

  const handleLogout = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  const isActive = (path) => {
    if (path === '/app') return location.pathname === '/app';
    return location.pathname.startsWith(path);
  };

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

            {/* Nav tabs */}
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
            {/* User indicator */}
            <div className="hidden md:flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-[#1B202B] border border-[#2A313D] flex items-center justify-center text-xs font-bold text-[#F2B95F]">
                {user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'U'}
              </div>
              <span className="text-sm text-[#A8B0BD] font-medium max-w-[160px] truncate">
                {user?.name || user?.email || 'User'}
              </span>
            </div>

            {/* Logout */}
            <button
              type="button"
              onClick={handleLogout}
              className="h-9 px-3 inline-flex items-center rounded-[6px] text-[12px] font-medium text-[#A8B0BD] hover:bg-[#1B202B] hover:text-[#F5F7FA] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0E1117] cursor-pointer"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main content - nested routes render here */}
      <main className="w-full max-w-[1440px] mx-auto px-5 md:px-6 lg:px-8 py-12 md:py-16">
        <Outlet />
      </main>
    </div>
  );
}