import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Logo from '../brand/Logo';

export default function Header() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  return (
    <header className="w-full bg-[#0E1117]/95 backdrop-blur border-b border-[#2A313D] sticky top-0 z-50">
      <div className="w-full max-w-[1440px] mx-auto px-5 md:px-6 lg:px-8 h-[72px] flex items-center justify-between">
        <Link to="/" className="flex items-center min-w-0" aria-label="LinkSphere home">
          <div className="md:hidden">
            <Logo markOnly className="w-8 h-8" />
          </div>
          <div className="hidden md:block">
            <Logo className="w-8 h-8" />
          </div>
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          <a href="#features" className="text-sm font-medium text-[#A8B0BD] hover:text-[#F5F7FA] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0E1117] rounded-sm">
            Features
          </a>
          <a href="#how-it-works" className="text-sm font-medium text-[#A8B0BD] hover:text-[#F5F7FA] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0E1117] rounded-sm">
            How it works
          </a>
        </nav>

        <div className="hidden md:flex items-center gap-2">
          {isAuthenticated ? (
            <>
              <Link to="/app" className="h-10 px-3 inline-flex items-center rounded-[6px] text-[13px] font-medium text-[#A8B0BD] hover:bg-[#1B202B] hover:text-[#F5F7FA] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0E1117]">
                My Links
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="h-10 px-4 inline-flex items-center rounded-[6px] text-[13px] font-medium text-[#A8B0BD] hover:bg-[#1B202B] hover:text-[#F5F7FA] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0E1117] cursor-pointer"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="h-10 px-3 inline-flex items-center rounded-[6px] text-[13px] font-medium text-[#A8B0BD] hover:bg-[#1B202B] hover:text-[#F5F7FA] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0E1117]">
                Sign in
              </Link>
              <Link to="/register" className="h-10 px-4 inline-flex items-center rounded-[6px] border border-[#F2B95F]/50 text-[13px] font-medium text-[#F2B95F] hover:bg-[#F2B95F] hover:text-[#0E1117] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0E1117]">
                Create account
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          aria-expanded={isMobileMenuOpen}
          aria-label="Toggle navigation menu"
          className="md:hidden h-10 w-10 flex items-center justify-center text-[#A8B0BD] hover:text-[#F5F7FA] hover:bg-[#1B202B] rounded-[6px] transition-colors"
        >
          {isMobileMenuOpen ? (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      </div>

      {isMobileMenuOpen && (
        <div className="md:hidden border-t border-[#2A313D] bg-[#151922] px-5 py-4 space-y-3">
          <a
            href="#features"
            onClick={() => setIsMobileMenuOpen(false)}
            className="block text-sm font-medium text-[#A8B0BD] hover:text-[#F5F7FA] py-1"
          >
            Features
          </a>
          <a
            href="#how-it-works"
            onClick={() => setIsMobileMenuOpen(false)}
            className="block text-sm font-medium text-[#A8B0BD] hover:text-[#F5F7FA] py-1"
          >
            How it works
          </a>
          <div className="pt-2 border-t border-[#2A313D] flex flex-col gap-2">
            {isAuthenticated ? (
              <>
                <Link
                  to="/app"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="w-full h-10 inline-flex items-center justify-center rounded-[6px] text-sm font-medium text-[#A8B0BD] bg-[#1B202B] hover:text-[#F5F7FA]"
                >
                  My Links
                </Link>
                <button
                  type="button"
                  onClick={() => { setIsMobileMenuOpen(false); handleLogout(); }}
                  className="w-full h-10 inline-flex items-center justify-center rounded-[6px] text-sm font-medium text-[#A8B0BD] bg-[#1B202B] hover:text-[#F5F7FA] cursor-pointer"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="w-full h-10 inline-flex items-center justify-center rounded-[6px] text-sm font-medium text-[#A8B0BD] bg-[#1B202B] hover:text-[#F5F7FA]"
                >
                  Sign in
                </Link>
                <Link
                  to="/register"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="w-full h-10 inline-flex items-center justify-center rounded-[6px] border border-[#F2B95F]/50 text-sm font-medium text-[#F2B95F] hover:bg-[#F2B95F] hover:text-[#0E1117]"
                >
                  Create account
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
