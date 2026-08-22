import { useState, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // If already authenticated, redirect to /app
  if (isAuthenticated) {
    const from = location.state?.from?.pathname || '/app';
    navigate(from, { replace: true });
    return null;
  }

  const validate = useCallback(() => {
    const next = {};

    if (!email.trim()) {
      next.email = 'Email address is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      next.email = 'Please enter a valid email address.';
    }

    if (!password) {
      next.password = 'Password is required.';
    } else if (password.length < 8) {
      next.password = 'Password must be at least 8 characters long.';
    }

    return next;
  }, [email, password]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError('');

    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setErrors({});
    setIsLoading(true);

    try {
      await login({ email: email.trim().toLowerCase(), password });
      const from = location.state?.from?.pathname || '/app';
      navigate(from, { replace: true });
    } catch (err) {
      const status = err.response?.status;
      const message = err.response?.data?.error?.message || err.response?.data?.message || err.message;

      if (status === 401) {
        setServerError('Invalid email or password.');
      } else if (status === 429) {
        setServerError('Too many attempts. Please try again later.');
      } else if (!err.response) {
        setServerError('Network error. Please check your connection and try again.');
      } else {
        setServerError(message || 'Something went wrong. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full">
      {/* Mobile-only brand message */}
      <div className="lg:hidden mb-8 text-center">
        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#151922] border border-[#2A313D] text-[10px] font-mono font-semibold tracking-[0.14em] uppercase text-[#707A8A] mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-[#F2B95F]" aria-hidden="true" />
          LINKSPHERE
        </div>
        <h1 className="text-[32px] font-extrabold tracking-[-0.03em] leading-[1.04] text-[#F5F7FA]">
          TAKE CONTROL<br />OF YOUR LINKS.
        </h1>
      </div>

      {/* Login card */}
      <div className="border border-[#2A313D] bg-[#151922] rounded-[14px] overflow-hidden">
        {/* Card header */}
        <div className="px-6 md:px-7 py-4 border-b border-[#2A313D] bg-[#1B202B]/40 flex items-center justify-between">
          <span className="text-[11px] font-mono font-bold tracking-[0.14em] uppercase text-[#F5F7FA] flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#F2B95F]" aria-hidden="true" />
            SIGN IN
          </span>
          <span className="text-[10px] font-mono tracking-wider uppercase text-[#707A8A]">
            ACCOUNT ACCESS
          </span>
        </div>

        <div className="p-6 md:p-7">
          {serverError && (
            <div
              className="mb-5 p-3 border border-[#F06B7A]/30 bg-[#F06B7A]/10 rounded-[8px] text-sm text-[#F06B7A] flex items-center gap-2"
              role="alert"
              aria-live="polite"
            >
              <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM8 4a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 018 4zm0 8a.75.75 0 100-1.5.75.75 0 000 1.5z" />
              </svg>
              <span>{serverError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            {/* Email */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="login-email" className="block text-[11px] font-semibold tracking-[0.14em] uppercase text-[#A8B0BD]">
                  EMAIL
                </label>
                <span className="text-[10px] font-mono text-[#707A8A] uppercase tracking-wider">REQUIRED</span>
              </div>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errors.email) setErrors((prev) => ({ ...prev, email: '' }));
                  if (serverError) setServerError('');
                }}
                placeholder="you@example.com"
                autoComplete="email"
                disabled={isLoading}
                className={`w-full h-[52px] px-4 border bg-[#1B202B] text-[#F5F7FA] text-[14px] font-mono rounded-[8px] placeholder:text-[#707A8A]/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#151922] transition-colors ${
                  errors.email ? 'border-[#F06B7A]' : 'border-[#2A313D]'
                }`}
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? 'login-email-error' : undefined}
              />
              {errors.email && (
                <p id="login-email-error" className="mt-1.5 text-xs text-[#F06B7A] font-medium flex items-center gap-1.5" role="alert">
                  <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM8 4a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 018 4zm0 8a.75.75 0 100-1.5.75.75 0 000 1.5z" />
                  </svg>
                  {errors.email}
                </p>
              )}
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="login-password" className="block text-[11px] font-semibold tracking-[0.14em] uppercase text-[#A8B0BD]">
                  PASSWORD
                </label>
                <span className="text-[10px] font-mono text-[#707A8A] uppercase tracking-wider">8+ CHARS</span>
              </div>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errors.password) setErrors((prev) => ({ ...prev, password: '' }));
                  if (serverError) setServerError('');
                }}
                placeholder="••••••••"
                autoComplete="current-password"
                disabled={isLoading}
                className={`w-full h-[52px] px-4 border bg-[#1B202B] text-[#F5F7FA] text-[14px] font-mono rounded-[8px] placeholder:text-[#707A8A]/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#151922] transition-colors ${
                  errors.password ? 'border-[#F06B7A]' : 'border-[#2A313D]'
                }`}
                aria-invalid={Boolean(errors.password)}
                aria-describedby={errors.password ? 'login-password-error' : undefined}
              />
              {errors.password && (
                <p id="login-password-error" className="mt-1.5 text-xs text-[#F06B7A] font-medium flex items-center gap-1.5" role="alert">
                  <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM8 4a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 018 4zm0 8a.75.75 0 100-1.5.75.75 0 000 1.5z" />
                  </svg>
                  {errors.password}
                </p>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-[52px] bg-[#F2B95F] text-[#0E1117] text-[12px] font-bold tracking-[0.14em] uppercase flex items-center justify-center gap-2 hover:bg-[#E4A744] transition-colors disabled:opacity-60 disabled:cursor-not-allowed rounded-[8px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#151922] cursor-pointer"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4 text-[#0E1117]" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  SIGNING IN…
                </span>
              ) : (
                'SIGN IN'
              )}
            </button>
          </form>

          {/* Footer link */}
          <div className="mt-6 pt-5 border-t border-[#2A313D] text-center">
            <p className="text-sm text-[#A8B0BD]">
              Don&apos;t have an account?{' '}
              <Link
                to="/register"
                className="text-[#F2B95F] hover:text-[#E4A744] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#151922] rounded-sm"
              >
                Create one
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}