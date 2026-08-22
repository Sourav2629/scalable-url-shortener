import { useState, useEffect, useCallback, useRef, useId } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useLinks } from '../hooks/useLinks';
import { checkAliasAvailability } from '../services/url.service';
import { buildShortUrl } from '../utils/url-builder';
import { createLinkSchema } from '../shared/validators/link.validator';

// ─── Spinner ─────────────────────────────────────────────────────────────────
function Spinner({ className = 'w-4 h-4' }) {
  return (
    <svg className={`${className} animate-spin`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0110 10" strokeLinecap="round" />
    </svg>
  );
}

// ─── Field label ─────────────────────────────────────────────────────────────
function FieldLabel({ htmlFor, children, optional = false }) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-[13px] font-medium text-[#F5F7FA] mb-2"
    >
      {children}
      {optional && (
        <span className="ml-2 text-[12px] font-normal text-[#707A8A]">
          optional
        </span>
      )}
    </label>
  );
}

// ─── Field error ─────────────────────────────────────────────────────────────
function FieldError({ message }) {
  if (!message) return null;
  return (
    <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-[#F06B7A]" role="alert">
      <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" strokeLinecap="round" />
        <line x1="12" y1="16" x2="12.01" y2="16" strokeLinecap="round" />
      </svg>
      {message}
    </p>
  );
}

// ─── Base input class helper ──────────────────────────────────────────────────
function inputCls(hasError, extra = '') {
  return [
    'w-full px-4 bg-[#0E1117] border rounded-[8px]',
    'text-[#F5F7FA] placeholder-[#3A414D]',
    'focus:outline-none focus:ring-1 transition-colors',
    hasError
      ? 'border-[#F06B7A] focus:border-[#F06B7A] focus:ring-[#F06B7A]/30'
      : 'border-[#2A313D] focus:border-[#F2B95F] focus:ring-[#F2B95F]/20',
    extra,
  ].join(' ');
}

// ─── Alias status badge ───────────────────────────────────────────────────────
function AliasBadge({ status }) {
  if (status === 'idle') return null;

  const configs = {
    checking: {
      color: 'text-[#F2B95F]',
      icon: <Spinner className="w-3.5 h-3.5" />,
      text: 'Checking…',
    },
    available: {
      color: 'text-[#50CFA6]',
      icon: (
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
          <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
      text: 'Available',
    },
    taken: {
      color: 'text-[#F06B7A]',
      icon: (
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
          <line x1="18" y1="6" x2="6" y2="18" strokeLinecap="round" />
          <line x1="6" y1="6" x2="18" y2="18" strokeLinecap="round" />
        </svg>
      ),
      text: 'Already taken',
    },
    invalid: {
      color: 'text-[#F06B7A]',
      icon: (
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" strokeLinecap="round" />
          <line x1="12" y1="16" x2="12.01" y2="16" strokeLinecap="round" />
        </svg>
      ),
      text: 'Invalid alias',
    },
    reserved: {
      color: 'text-[#F06B7A]',
      icon: (
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" strokeLinecap="round" />
          <line x1="12" y1="16" x2="12.01" y2="16" strokeLinecap="round" />
        </svg>
      ),
      text: 'Reserved alias',
    },
  };

  const cfg = configs[status];
  if (!cfg) return null;

  return (
    <span className={`inline-flex items-center gap-1.5 text-[12px] font-medium ${cfg.color}`} aria-live="polite" aria-atomic="true">
      {cfg.icon}
      {cfg.text}
    </span>
  );
}

// ─── Alias input with static prefix (no overlap) ──────────────────────────────
function AliasInput({ value, onChange, onBlur, disabled, hasError, aliasStatus, errorId }) {
  const displayBase = import.meta.env.VITE_PUBLIC_REDIRECT_BASE_URL || 'http://localhost:5000';
  const displayPrefix = displayBase.replace(/^https?:\/\//, '');
  const inputRef = useRef(null);

  const handleWrapperClick = () => {
    inputRef.current?.focus();
  };

  const borderCls = hasError
    ? 'border-[#F06B7A] focus-within:border-[#F06B7A] focus-within:ring-1 focus-within:ring-[#F06B7A]/30'
    : aliasStatus === 'available'
    ? 'border-[#50CFA6]/60 focus-within:border-[#50CFA6] focus-within:ring-1 focus-within:ring-[#50CFA6]/20'
    : aliasStatus === 'taken' || aliasStatus === 'reserved'
    ? 'border-[#F06B7A]/60 focus-within:border-[#F06B7A] focus-within:ring-1 focus-within:ring-[#F06B7A]/30'
    : 'border-[#2A313D] focus-within:border-[#F2B95F] focus-within:ring-1 focus-within:ring-[#F2B95F]/20';

  return (
    <div
      className={`flex items-center h-11 bg-[#0E1117] border rounded-[8px] overflow-hidden cursor-text transition-colors ${borderCls}`}
      onClick={handleWrapperClick}
      aria-label="Custom alias input"
    >
      <span
        className="flex-shrink-0 px-4 font-mono text-[13px] text-[#707A8A] select-none whitespace-nowrap border-r border-[#2A313D] bg-[#151922]"
        aria-hidden="true"
      >
        {displayPrefix}/
      </span>

      <input
        ref={inputRef}
        type="text"
        id="customAlias"
        name="customAlias"
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        placeholder="my-alias"
        className="flex-1 h-full bg-transparent border-0 outline-none ring-0 focus:outline-none focus:ring-0 font-mono text-[13px] text-[#F5F7FA] placeholder-[#3A414D] px-4 min-w-0"
        aria-label="Custom alias slug"
        aria-invalid={hasError}
        aria-describedby={errorId}
        disabled={disabled}
        maxLength={30}
        autoComplete="off"
        spellCheck={false}
      />
    </div>
  );
}

// ─── Advanced toggle ─────────────────────────────────────────────────────────
function AdvancedSection({ children }) {
  const [open, setOpen] = useState(false);
  const toggleId = useId();

  return (
    <div>
      <button
        type="button"
        id={toggleId}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2.5 text-[14px] font-semibold text-[#A8B0BD] hover:text-[#F5F7FA] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] rounded-[8px] px-4 py-2.5 bg-[#1B202B] border border-[#2A313D] hover:border-[#3A414D] hover:bg-[#202630]"
        aria-expanded={open}
        aria-controls={`${toggleId}-panel`}
      >
        <svg
          className={`w-5 h-5 transition-transform duration-200 ${open ? 'rotate-90' : ''} text-[#F2B95F]`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"
        >
          <polyline points="9 18 15 12 9 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Advanced settings
      </button>

      {open && (
        <div id={`${toggleId}-panel`} className="mt-5 space-y-5 animate-slide-in" role="region" aria-labelledby={toggleId}>
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Toggle switch ────────────────────────────────────────────────────────────
function ToggleSwitch({ id, name, checked, onChange, disabled, label }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <label htmlFor={id} className="block text-[13px] font-medium text-[#F5F7FA] cursor-pointer select-none">
          {label}
        </label>
        <p className="text-[12px] text-[#707A8A] mt-0.5">
          {checked ? 'Link is active and accepting clicks' : 'Link is paused'}
        </p>
      </div>
      <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
        <input
          type="checkbox"
          id={id}
          name={name}
          checked={checked}
          onChange={onChange}
          className="sr-only peer"
          disabled={disabled}
        />
        <div className="w-10 h-[22px] bg-[#2A313D] rounded-full transition-colors peer-checked:bg-[#F2B95F] peer-focus-visible:ring-2 peer-focus-visible:ring-[#F2B95F] peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-[#0E1117] peer-disabled:opacity-50 peer-disabled:cursor-not-allowed relative">
          <div className={`absolute top-[3px] left-[3px] w-4 h-4 bg-white rounded-full transition-transform duration-200 ${checked ? 'translate-x-[18px]' : 'translate-x-0'}`} />
        </div>
      </label>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function CreateLinkPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { createLink, updateLink, getLink } = useLinks();

  const isEditMode = Boolean(id);
  const aliasErrorId = useId();

  const [formData, setFormData] = useState({
    originalUrl: '',
    customAlias: '',
    title: '',
    description: '',
    expiresAt: '',
    isActive: true,
  });

  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [aliasStatus, setAliasStatus] = useState('idle');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(isEditMode);
  const [generalError, setGeneralError] = useState(null);

  const aliasCheckTimeoutRef = useRef(null);
  const previousAliasRef = useRef('');

  useEffect(() => {
    if (!isEditMode || !id) return;
    const loadLink = async () => {
      try {
        setIsLoading(true);
        const link = await getLink(id);
        setFormData({
          originalUrl: link.originalUrl || '',
          customAlias: link.shortCode || '',
          title: link.title || '',
          description: link.description || '',
          expiresAt: link.expiresAt ? new Date(link.expiresAt).toISOString().slice(0, 16) : '',
          isActive: link.isActive !== false,
        });
        setGeneralError(null);
      } catch {
        setGeneralError('Failed to load link. It may have been deleted or you may not have permission.');
      } finally {
        setIsLoading(false);
      }
    };
    loadLink();
  }, [id, isEditMode, getLink]);

  const checkAlias = useCallback((alias) => {
    if (aliasCheckTimeoutRef.current) clearTimeout(aliasCheckTimeoutRef.current);

    if (!alias || alias.trim().length < 3) {
      setAliasStatus('idle');
      return;
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(alias)) {
      setAliasStatus('invalid');
      return;
    }

    const RESERVED = new Set(['api', 'v1', 'health', 'auth', 'urls', 'analytics', 'login', 'register', 'logout', 'me', 'admin', 'dashboard', 'static', 'assets', 'public']);
    if (RESERVED.has(alias.toLowerCase())) {
      setAliasStatus('reserved');
      return;
    }

    if (alias === previousAliasRef.current) return;
    previousAliasRef.current = alias;

    setAliasStatus('checking');

    aliasCheckTimeoutRef.current = setTimeout(async () => {
      try {
        const result = await checkAliasAvailability(alias);
        setAliasStatus(result.available ? 'available' : 'taken');
      } catch {
        setAliasStatus('idle');
      }
    }, 400);
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    const newValue = type === 'checkbox' ? checked : value;
    setFormData((prev) => ({ ...prev, [name]: newValue }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: null }));
    if (name === 'customAlias' && !isEditMode) checkAlias(newValue);
  };

  const handleBlur = (e) => {
    const { name } = e.target;
    setTouched((prev) => ({ ...prev, [name]: true }));
    try {
      createLinkSchema.shape[name]?.parse(formData[name]);
      setErrors((prev) => ({ ...prev, [name]: null }));
    } catch (err) {
      if (err.errors?.[0]) setErrors((prev) => ({ ...prev, [name]: err.errors[0].message }));
    }
  };

  const validateForm = () => {
    try {
      createLinkSchema.parse(formData);
      setErrors({});
      return true;
    } catch (err) {
      const newErrors = {};
      err.errors?.forEach((e) => { if (e.path[0]) newErrors[e.path[0]] = e.message; });
      setErrors(newErrors);
      setTouched({ originalUrl: true, customAlias: true, title: true, description: true, expiresAt: true });
      return false;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);
    setGeneralError(null);

    try {
      const payload = {
        originalUrl: formData.originalUrl,
        customAlias: formData.customAlias?.trim() || undefined,
        title: formData.title?.trim() || undefined,
        description: formData.description?.trim() || undefined,
        expiresAt: formData.expiresAt || undefined,
        isActive: formData.isActive,
      };

      let result;
      if (isEditMode) {
        result = await updateLink(id, payload);
      } else {
        result = await createLink(payload);
      }

      const shortUrl = buildShortUrl(result.shortCode);

      navigate('/app/links', {
        replace: false,
        state: {
          successNotification: {
            shortUrl,
            title: result.title || undefined,
          },
        },
      });
    } catch (err) {
      const message = err.response?.data?.message || err.message;
      setGeneralError(message || (isEditMode ? 'Failed to update link.' : 'Failed to create link.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="flex flex-col items-center gap-3 text-[#707A8A]">
          <Spinner className="w-6 h-6 text-[#F2B95F]" />
          <span className="text-sm">Loading...</span>
        </div>
      </div>
    );
  }

  if (generalError && isEditMode && !isSubmitting) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 text-center">
        <div className="w-12 h-12 rounded-full bg-[#F06B7A]/10 border border-[#F06B7A]/20 flex items-center justify-center">
          <svg className="w-5 h-5 text-[#F06B7A]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" strokeLinecap="round" />
            <line x1="12" y1="16" x2="12.01" y2="16" strokeLinecap="round" />
          </svg>
        </div>
        <div>
          <p className="text-[15px] font-semibold text-[#F5F7FA] mb-1">Unable to load link</p>
          <p className="text-sm text-[#707A8A]">{generalError}</p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/app/links')}
          className="h-9 px-4 inline-flex items-center gap-2 rounded-[6px] bg-[#1E242D] border border-[#2A313D] text-[#A8B0BD] text-[13px] font-medium hover:bg-[#2A313D] hover:text-[#F5F7FA] transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Your Links
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[90%] md:max-w-[900px] lg:max-w-[1600px] animate-slide-in">

      <div className="mb-8">
        <Link
          to="/app/links"
          className="inline-flex items-center gap-2 text-[16px] font-medium text-[#707A8A] hover:text-[#A8B0BD] transition-colors group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] rounded-[4px]"
        >
          <svg className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Your Links
        </Link>
      </div>

      <div className="mb-10">
        <h1 className="text-[32px] md:text-[38px] font-extrabold tracking-[-0.03em] leading-[1.04] text-[#F5F7FA] mb-2">
          {isEditMode ? 'Edit link' : 'Create a link'}
        </h1>
        <p className="text-[15px] text-[#707A8A] leading-relaxed">
          {isEditMode
            ? 'Update the destination, alias, and settings for this link.'
            : 'Create a short link you can customize and manage.'}
        </p>
      </div>

      <div className="bg-[#151922] border border-[#2A313D] rounded-[14px]">

        <form onSubmit={handleSubmit} noValidate>
          <div className="p-6 md:p-7 space-y-7">

            {generalError && !isEditMode && (
              <div className="p-3.5 border border-[#F06B7A]/30 bg-[#F06B7A]/8 rounded-[8px] flex items-start gap-2.5" role="alert">
                <svg className="w-4 h-4 text-[#F06B7A] flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" strokeLinecap="round" />
                  <line x1="12" y1="16" x2="12.01" y2="16" strokeLinecap="round" />
                </svg>
                <p className="text-[13px] text-[#F06B7A]">{generalError}</p>
              </div>
            )}

            {/* 1. Destination URL — Primary */}
            <div>
              <FieldLabel htmlFor="originalUrl">Destination URL</FieldLabel>
              <input
                type="url"
                id="originalUrl"
                name="originalUrl"
                value={formData.originalUrl}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder="https://example.com/your-long-url"
                className={[
                  'w-full h-12 pl-4 pr-4 bg-[#0E1117] border rounded-[8px]',
                  'font-mono text-[13px] text-[#F5F7FA] placeholder-[#3A414D]',
                  'focus:outline-none focus:ring-1 transition-colors',
                  touched.originalUrl && errors.originalUrl
                    ? 'border-[#F06B7A] focus:border-[#F06B7A] focus:ring-[#F06B7A]/30'
                    : 'border-[#2A313D] focus:border-[#F2B95F] focus:ring-[#F2B95F]/20',
                ].join(' ')}
                aria-invalid={touched.originalUrl && !!errors.originalUrl}
                disabled={isSubmitting}
              />
              <FieldError message={touched.originalUrl && errors.originalUrl} />
            </div>

            {/* 2. Custom Alias — Primary */}
            <div>
              <FieldLabel htmlFor="customAlias" optional>Custom Alias</FieldLabel>
              <AliasInput
                value={formData.customAlias}
                onChange={handleChange}
                onBlur={handleBlur}
                disabled={isSubmitting || isEditMode}
                hasError={touched.customAlias && !!errors.customAlias}
                aliasStatus={aliasStatus}
                errorId={aliasErrorId}
              />
              <div className="mt-1.5 min-h-[18px]" id={aliasErrorId}>
                {touched.customAlias && errors.customAlias ? (
                  <FieldError message={errors.customAlias} />
                ) : (
                  <AliasBadge status={aliasStatus} />
                )}
              </div>
            </div>

            {/* 3. Link Details — Secondary (Title + Description) */}
            <div className="grid sm:grid-cols-2 gap-5 pt-2">
              <div>
                <FieldLabel htmlFor="title" optional>Title</FieldLabel>
                <input
                  type="text"
                  id="title"
                  name="title"
                  value={formData.title}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  placeholder="My link"
                  className={inputCls(touched.title && !!errors.title, 'h-11 text-[14px]')}
                  aria-invalid={touched.title && !!errors.title}
                  disabled={isSubmitting}
                  maxLength={200}
                />
                <FieldError message={touched.title && errors.title} />
              </div>

              <div>
                <FieldLabel htmlFor="description" optional>Description</FieldLabel>
                <textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  placeholder="Internal notes..."
                  rows={1}
                  className={inputCls(touched.description && !!errors.description, 'py-2.5 text-[14px] resize-none leading-relaxed')}
                  style={{ minHeight: '44px' }}
                  aria-invalid={touched.description && !!errors.description}
                  disabled={isSubmitting}
                  maxLength={2000}
                />
                <FieldError message={touched.description && errors.description} />
              </div>
            </div>

            {/* Single structural divider before Advanced */}
            <div className="border-t border-[#2A313D] pt-2" />

            {/* 4. Advanced Settings — Collapsed by default */}
            <AdvancedSection>
              <div>
                <FieldLabel htmlFor="expiresAt" optional>Expiration</FieldLabel>
                <input
                  type="datetime-local"
                  id="expiresAt"
                  name="expiresAt"
                  value={formData.expiresAt}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  className={inputCls(touched.expiresAt && !!errors.expiresAt, 'h-11 text-[13px]')}
                  aria-invalid={touched.expiresAt && !!errors.expiresAt}
                  disabled={isSubmitting}
                  min={new Date().toISOString().slice(0, 16)}
                  style={{ colorScheme: 'dark' }}
                />
                <FieldError message={touched.expiresAt && errors.expiresAt} />
              </div>

              <ToggleSwitch
                id="isActive"
                name="isActive"
                checked={formData.isActive}
                onChange={handleChange}
                disabled={isSubmitting}
                label="Active link"
              />
            </AdvancedSection>

          </div>

          {/* Actions bar — single clear primary action */}
          <div className="px-6 md:px-7 py-5 border-t border-[#2A313D] bg-[#1B202B]/20 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => navigate('/app/links')}
              className="h-10 px-5 inline-flex items-center justify-center gap-2 rounded-[6px] bg-transparent border border-[#2A313D] text-[#A8B0BD] font-semibold text-[13px] hover:bg-[#1E242D] hover:text-[#F5F7FA] hover:border-[#3A414D] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#151922]"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="h-10 px-6 inline-flex items-center justify-center gap-2 rounded-[6px] bg-[#F2B95F] text-[#0E1117] font-bold text-[13px] hover:bg-[#E4A744] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#151922] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Spinner className="w-4 h-4 text-[#0E1117]" />
                  {isEditMode ? 'Updating...' : 'Creating...'}
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                    <path d="M12 5v14M5 12h14" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {isEditMode ? 'Update link' : 'Create link'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
