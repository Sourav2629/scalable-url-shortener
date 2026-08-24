import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as authService from '../services/auth.service';

const SESSION_STORAGE_KEY = 'emailPasswordReset';

export default function ForgotPasswordPage() {
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const validate = () => {
    if (!email.trim()) {
      return { email: 'Email address is required.' };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return { email: 'Please enter a valid email address.' };
    }
    return {};
  };

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
      const normalizedEmail = email.trim().toLowerCase();
      await authService.forgotPassword({ email: normalizedEmail });

      // Store email for the reset page and navigate directly
      sessionStorage.setItem(SESSION_STORAGE_KEY, normalizedEmail);
      navigate('/reset-password', { state: { email: normalizedEmail } });
    } catch (err) {
      const status = err.response?.status;
      const message = err.response?.data?.message || err.message;

      if (status === 429) {
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
          FORGOT YOUR<br />PASSWORD?
        </h1>
      </div>

      {/* Card */}
      <div className="border border-[#2A313D] bg-[#151922] rounded-[14px] overflow-hidden">
        {/* Card header */}
        <div className="px-6 md:px-7 py-4 border-b border-[#2A313D] bg-[#1B202B]/40 flex items-center justify-between">
          <span className="text-[11px] font-mono font-bold tracking-[0.14em] uppercase text-[#F5F7FA] flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#F2B95F]" aria-hidden="true" />
            RESET PASSWORD
          </span>
          <span className="text-[10px] font-mono tracking-wider uppercase text-[#707A8A]">
            RECOVERY
          </span>
        </div>

        <div className="p-6 md:p-7">
          {/* Server error */}
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

          {/* Info text */}
          <div className="mb-6">
            <p className="text-[14px] text-[#A8B0BD] leading-[1.6]">
              Enter the email address associated with your account and we&apos;ll send you a 6-digit code to reset your password.
            </p>
          </div>

          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="forgot-email" className="block text-[11px] font-semibold tracking-[0.14em] uppercase text-[#A8B0BD]">
                  EMAIL
                </label>
                <span className="text-[10px] font-mono text-[#707A8A] uppercase tracking-wider">REQUIRED</span>
              </div>
              <input
                id="forgot-email"
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
                aria-describedby={errors.email ? 'forgot-email-error' : undefined}
              />
              {errors.email && (
                <p id="forgot-email-error" className="mt-1.5 text-xs text-[#F06B7A] font-medium flex items-center gap-1.5" role="alert">
                  <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM8 4a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 018 4zm0 8a.75.75 0 100-1.5.75.75 0 000 1.5z" />
                  </svg>
                  {errors.email}
                </p>
              )}
            </div>

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
                  SENDING CODE…
                </span>
              ) : (
                'SEND RESET CODE'
              )}
            </button>
          </form>

          {/* Footer link */}
          <div className="mt-6 pt-5 border-t border-[#2A313D] text-center">
            <p className="text-sm text-[#A8B0BD]">
              Remember your password?{' '}
              <Link
                to="/login"
                className="text-[#F2B95F] hover:text-[#E4A744] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#151922] rounded-sm"
              >
                Back to sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
