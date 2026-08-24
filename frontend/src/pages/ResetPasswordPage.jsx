import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import * as authService from '../services/auth.service';

const SESSION_STORAGE_KEY = 'emailPasswordReset';
const RESEND_COOLDOWN_SECONDS = 60;

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const cooldownRef = useRef(null);

  // Resolve email from route state or sessionStorage
  useEffect(() => {
    const resolvedEmail = location.state?.email || sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (resolvedEmail) {
      setEmail(resolvedEmail);
      sessionStorage.setItem(SESSION_STORAGE_KEY, resolvedEmail);
    }
  }, [location.state?.email]);

  // If no email is available, redirect to forgot-password
  useEffect(() => {
    const resolvedEmail = location.state?.email || sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!resolvedEmail) {
      navigate('/forgot-password', { replace: true });
    }
  }, [location.state?.email, navigate]);

  // Cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return;

    cooldownRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(cooldownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (cooldownRef.current) {
        clearInterval(cooldownRef.current);
      }
    };
  }, [cooldown > 0]);

  const validate = useCallback(() => {
    const next = {};

    if (!code.trim()) {
      next.code = 'Enter your 6-digit reset code.';
    } else if (code.trim().length < 6) {
      next.code = 'Reset code must be exactly 6 digits.';
    }

    if (!newPassword) {
      next.newPassword = 'Password is required.';
    } else if (newPassword.trim().length < 8) {
      next.newPassword = 'Password must be at least 8 characters long.';
    }

    if (!confirmPassword) {
      next.confirmPassword = 'Please confirm your password.';
    } else if (newPassword !== confirmPassword) {
      next.confirmPassword = 'Passwords do not match.';
    }

    return next;
  }, [code, newPassword, confirmPassword]);

  const handleCodeChange = useCallback((e) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 6);
    setCode(value);
    if (errors.code) setErrors((prev) => ({ ...prev, code: '' }));
    if (serverError) setServerError('');
    if (successMessage) setSuccessMessage('');
  }, [errors.code, serverError, successMessage]);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    setServerError('');
    setSuccessMessage('');

    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    if (!email) {
      setServerError('No email address is available. Please go back to forgot password.');
      return;
    }

    setErrors({});
    setIsLoading(true);

    try {
      await authService.resetPassword({
        email,
        code: code.trim(),
        newPassword: newPassword.trim(),
      });

      setSuccessMessage('Password reset successfully. Redirecting to sign in…');

      // Clean up
      sessionStorage.removeItem(SESSION_STORAGE_KEY);

      // Navigate to login after brief success display
      setTimeout(() => {
        navigate('/login', { replace: true });
      }, 1500);
    } catch (err) {
      const status = err.response?.status;
      const message = err.response?.data?.message || err.message;

      if (status === 400) {
        setServerError(message || 'Invalid reset code.');
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
  }, [code, newPassword, confirmPassword, email, validate, navigate]);

  const handleResend = useCallback(async () => {
    if (cooldown > 0 || !email) return;

    setResendLoading(true);
    setServerError('');
    setSuccessMessage('');

    try {
      await authService.resendPasswordReset({ email });
      setSuccessMessage('A new password reset code has been sent to your email.');
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      const status = err.response?.status;
      const message = err.response?.data?.message || err.message;

      if (!err.response) {
        setServerError('Network error. Please check your connection and try again.');
      } else {
        setServerError(message || 'Unable to resend reset code.');
      }
    } finally {
      setResendLoading(false);
    }
  }, [cooldown, email]);

  if (!email) {
    return null; // Redirecting to /forgot-password
  }

  return (
    <div className="w-full">
      {/* Mobile-only brand message */}
      <div className="lg:hidden mb-8 text-center">
        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#151922] border border-[#2A313D] text-[10px] font-mono font-semibold tracking-[0.14em] uppercase text-[#707A8A] mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-[#F2B95F]" aria-hidden="true" />
          RESET PASSWORD
        </div>
        <h1 className="text-[32px] font-extrabold tracking-[-0.03em] leading-[1.04] text-[#F5F7FA]">
          RESET YOUR<br />PASSWORD.
        </h1>
      </div>

      {/* Reset card */}
      <div className="border border-[#2A313D] bg-[#151922] rounded-[14px] overflow-hidden">
        {/* Card header */}
        <div className="px-6 md:px-7 py-4 border-b border-[#2A313D] bg-[#1B202B]/40 flex items-center justify-between">
          <span className="text-[11px] font-mono font-bold tracking-[0.14em] uppercase text-[#F5F7FA] flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#F2B95F]" aria-hidden="true" />
            RESET PASSWORD
          </span>
          <span className="text-[10px] font-mono tracking-wider uppercase text-[#707A8A]">
            6-DIGIT CODE
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

          {/* Success message */}
          {successMessage && (
            <div
              className="mb-5 p-3 border border-[#50CFA6]/30 bg-[#50CFA6]/10 rounded-[8px] text-sm text-[#50CFA6] flex items-center gap-2"
              role="status"
              aria-live="polite"
            >
              <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M8 16A8 8 0 108 0a8 8 0 000 16zm3.78-9.72a.75.75 0 00-1.06-1.06L7 8.94 5.28 7.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.06 0l4.25-4.25z" clipRule="evenodd" />
              </svg>
              <span>{successMessage}</span>
            </div>
          )}

          {/* Info text */}
          <div className="mb-6">
            <p className="text-[14px] text-[#A8B0BD] leading-[1.6]">
              We sent a 6-digit reset code to
            </p>
            <p className="text-[14px] font-mono font-medium text-[#F5F7FA] mt-1">
              {email}
            </p>
          </div>

          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            {/* OTP Code */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="reset-code" className="block text-[11px] font-semibold tracking-[0.14em] uppercase text-[#A8B0BD]">
                  RESET CODE
                </label>
                <span className="text-[10px] font-mono text-[#707A8A] uppercase tracking-wider">6 DIGITS</span>
              </div>
              <input
                id="reset-code"
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={handleCodeChange}
                placeholder="000000"
                autoComplete="one-time-code"
                disabled={isLoading}
                className={`w-full h-[52px] px-4 border bg-[#1B202B] text-[#F5F7FA] text-[20px] font-mono tracking-[0.3em] text-center rounded-[8px] placeholder:text-[#707A8A]/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#151922] transition-colors ${
                  errors.code ? 'border-[#F06B7A]' : 'border-[#2A313D]'
                }`}
                aria-invalid={Boolean(errors.code)}
                aria-describedby={errors.code ? 'reset-code-error' : undefined}
              />
              {errors.code && (
                <p id="reset-code-error" className="mt-1.5 text-xs text-[#F06B7A] font-medium flex items-center gap-1.5" role="alert">
                  <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM8 4a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 018 4zm0 8a.75.75 0 100-1.5.75.75 0 000 1.5z" />
                  </svg>
                  {errors.code}
                </p>
              )}
            </div>

            {/* New Password */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="reset-new-password" className="block text-[11px] font-semibold tracking-[0.14em] uppercase text-[#A8B0BD]">
                  NEW PASSWORD
                </label>
                <span className="text-[10px] font-mono text-[#707A8A] uppercase tracking-wider">8+ CHARS</span>
              </div>
              <input
                id="reset-new-password"
                type="password"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  if (errors.newPassword) setErrors((prev) => ({ ...prev, newPassword: '' }));
                }}
                placeholder="••••••••"
                autoComplete="new-password"
                disabled={isLoading}
                className={`w-full h-[52px] px-4 border bg-[#1B202B] text-[#F5F7FA] text-[14px] font-mono rounded-[8px] placeholder:text-[#707A8A]/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#151922] transition-colors ${
                  errors.newPassword ? 'border-[#F06B7A]' : 'border-[#2A313D]'
                }`}
                aria-invalid={Boolean(errors.newPassword)}
                aria-describedby={errors.newPassword ? 'reset-new-password-error' : undefined}
              />
              {errors.newPassword && (
                <p id="reset-new-password-error" className="mt-1.5 text-xs text-[#F06B7A] font-medium flex items-center gap-1.5" role="alert">
                  <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM8 4a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 018 4zm0 8a.75.75 0 100-1.5.75.75 0 000 1.5z" />
                  </svg>
                  {errors.newPassword}
                </p>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="reset-confirm-password" className="block text-[11px] font-semibold tracking-[0.14em] uppercase text-[#A8B0BD]">
                  CONFIRM PASSWORD
                </label>
                <span className="text-[10px] font-mono text-[#707A8A] uppercase tracking-wider">MATCH</span>
              </div>
              <input
                id="reset-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (errors.confirmPassword) setErrors((prev) => ({ ...prev, confirmPassword: '' }));
                }}
                placeholder="••••••••"
                autoComplete="new-password"
                disabled={isLoading}
                className={`w-full h-[52px] px-4 border bg-[#1B202B] text-[#F5F7FA] text-[14px] font-mono rounded-[8px] placeholder:text-[#707A8A]/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#151922] transition-colors ${
                  errors.confirmPassword ? 'border-[#F06B7A]' : 'border-[#2A313D]'
                }`}
                aria-invalid={Boolean(errors.confirmPassword)}
                aria-describedby={errors.confirmPassword ? 'reset-confirm-password-error' : undefined}
              />
              {errors.confirmPassword && (
                <p id="reset-confirm-password-error" className="mt-1.5 text-xs text-[#F06B7A] font-medium flex items-center gap-1.5" role="alert">
                  <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM8 4a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 018 4zm0 8a.75.75 0 100-1.5.75.75 0 000 1.5z" />
                  </svg>
                  {errors.confirmPassword}
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
                  RESETTING PASSWORD…
                </span>
              ) : (
                'RESET PASSWORD'
              )}
            </button>
          </form>

          {/* Resend + footer */}
          <div className="mt-6 pt-5 border-t border-[#2A313D] text-center space-y-3">
            <p className="text-sm text-[#A8B0BD]">
              Didn&apos;t receive the code?{' '}
              {cooldown > 0 ? (
                <span className="text-[#707A8A] font-medium">
                  Resend code in {cooldown}s
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendLoading}
                  className="text-[#F2B95F] hover:text-[#E4A744] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#151922] rounded-sm disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {resendLoading ? 'Sending…' : 'Resend code'}
                </button>
              )}
            </p>
            <p className="text-sm text-[#A8B0BD]">
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
