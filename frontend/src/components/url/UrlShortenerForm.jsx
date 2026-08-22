import { useState } from 'react';

export default function UrlShortenerForm({ onSubmit, onShortenSuccess, isLoading, loading: loadingProp, error, errorMessage: errorProp, resultData, onReset }) {
  const [urlInput, setUrlInput] = useState('');
  const [localError, setLocalError] = useState('');
  const [internalLoading, setInternalLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const isFormLoading = isLoading || loadingProp || internalLoading;
  const displayError = localError || error || errorProp;
  const baseUrl = import.meta.env.VITE_API_BASE_URL || window.location.origin;
  const cleanBaseUrl = baseUrl.replace(/\/api\/v1\/?$/, '').replace(/\/+$/, '');
  const shortUrl = resultData?.shortUrl || (resultData?.shortCode ? `${cleanBaseUrl}/${resultData.shortCode}` : '');
  const originalUrl = resultData?.originalUrl || '';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError('');

    let trimmed = urlInput.trim();
    if (!trimmed) {
      setLocalError('Please enter a URL to shorten.');
      return;
    }

    if (!/^https?:\/\//i.test(trimmed)) {
      if (/^[a-zA-Z0-9][-a-zA-Z0-9.]*\.[a-zA-Z]{2,}/.test(trimmed)) {
        trimmed = `https://${trimmed}`;
      } else {
        setLocalError('Please enter a valid URL (e.g. https://example.com).');
        return;
      }
    }

    const submitFn = onSubmit || onShortenSuccess;
    if (!submitFn) return;

    try {
      setInternalLoading(true);
      await submitFn(trimmed);
      setUrlInput('');
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.response?.data?.message || err.message || 'Failed to shorten URL. Please try again.';
      setLocalError(msg);
    } finally {
      setInternalLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!shortUrl) return;
    try {
      await navigator.clipboard.writeText(shortUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      const inputEl = document.createElement('input');
      inputEl.value = shortUrl;
      document.body.appendChild(inputEl);
      inputEl.select();
      document.execCommand('copy');
      document.body.removeChild(inputEl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    }
  };

  return (
    <div className={`w-full max-w-[620px] mx-auto border bg-[#151922] rounded-[14px] transition-all duration-300 ${
      shortUrl
        ? 'border-[#50CFA6]/40 shadow-[0_24px_50px_rgba(80,207,166,0.08)]'
        : 'border-[#2A313D] shadow-[0_24px_50px_rgba(0,0,0,0.4)]'
    }`}>
      <div className="px-6 md:px-7 py-4 border-b border-[#2A313D] flex items-center justify-between bg-[#1B202B]/40 rounded-t-[14px]">
        <span className="text-[11px] font-mono font-bold tracking-[0.14em] uppercase text-[#F5F7FA] flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#F2B95F]" aria-hidden="true" />
          SHORTEN A LINK
        </span>
        <span className="text-[10px] font-mono tracking-wider uppercase text-[#707A8A]">
          GUEST ACCESS
        </span>
      </div>

      <div className="p-6 md:p-7 space-y-6">
        {!shortUrl ? (
          <>
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="long-url" className="block text-[11px] font-semibold tracking-[0.14em] uppercase text-[#A8B0BD]">
                    DESTINATION
                  </label>
                  <span className="text-[10px] font-mono text-[#707A8A] uppercase tracking-wider">REQUIRED</span>
                </div>
                <input
                  id="long-url"
                  type="url"
                  value={urlInput}
                  onChange={(e) => {
                    setUrlInput(e.target.value);
                    if (localError) setLocalError('');
                  }}
                  placeholder="https://example.com/your-long-url"
                  className={`w-full h-[54px] px-4 border bg-[#1B202B] text-[#F5F7FA] text-[14px] font-mono rounded-[8px] placeholder:text-[#707A8A]/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#151922] ${
                    displayError ? 'border-[#F06B7A]' : 'border-[#2A313D]'
                  }`}
                  disabled={isFormLoading}
                  aria-label="URL to shorten"
                  autoComplete="off"
                  spellCheck="false"
                />
              </div>

              <button
                type="submit"
                disabled={isFormLoading}
                className="w-full h-[52px] bg-[#F2B95F] text-[#0E1117] text-[12px] font-bold tracking-[0.14em] uppercase flex items-center justify-center gap-2 hover:bg-[#E4A744] transition-colors disabled:opacity-60 disabled:cursor-not-allowed rounded-[8px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#151922] cursor-pointer"
              >
                {isFormLoading ? (
                  <span className="animate-pulse flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4 text-[#0E1117]" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    SHORTENING...
                  </span>
                ) : (
                  <>
                    <span>SHORTEN URL</span>
                    <span aria-hidden="true">→</span>
                  </>
                )}
              </button>

              <div className="flex items-center justify-between text-[10px] text-[#707A8A]">
                <span className="font-mono uppercase tracking-wider text-[#707A8A]">
                  NO ACCOUNT REQUIRED
                </span>
                <span className="text-[#707A8A]">
                  Instant short link
                </span>
              </div>

              {displayError && (
                <div className="text-xs text-[#F06B7A] font-medium flex items-center gap-1.5 pt-1" role="alert" aria-live="polite">
                  <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM8 4a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 018 4zm0 8a.75.75 0 100-1.5.75.75 0 000 1.5z"/>
                  </svg>
                  <span>{displayError}</span>
                </div>
              )}
            </form>

            <div className="pt-5 border-t border-[#2A313D]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold tracking-[0.14em] uppercase text-[#707A8A]">
                  YOUR SHORT LINK
                </span>
                <span className="text-[10px] font-mono text-[#707A8A]">
                  PREVIEW
                </span>
              </div>
              <div className="p-4 border border-dashed border-[#2A313D] bg-[#1B202B]/60 rounded-[8px] space-y-1">
                <div className="text-xs font-mono font-bold text-[#A8B0BD] tracking-wide uppercase">
                  READY WHEN YOU ARE
                </div>
                <div className="text-xs text-[#707A8A]">
                  Paste a URL above to create your short link.
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-5">
            <div className="flex items-center justify-between pb-1">
              <span className="text-[10px] font-bold tracking-[0.14em] uppercase text-[#50CFA6] flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 01.208 1.04l-5 7.5a.75.75 0 01-1.154.114l-3-3a.75.75 0 011.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 011.04-.207z" clipRule="evenodd" />
                </svg>
                <span>YOUR SHORT LINK IS READY</span>
              </span>
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#50CFA6] bg-[#50CFA6]/10 px-2 py-0.5 rounded border border-[#50CFA6]/20">
                ACTIVE
              </span>
            </div>

            <div className="p-4 border border-[#50CFA6]/30 bg-[#1B202B] rounded-[8px] space-y-3">
              <a
                href={shortUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block font-mono text-[20px] sm:text-[22px] leading-tight font-bold text-[#F5F7FA] hover:text-[#F2B95F] transition-colors break-all"
              >
                {shortUrl}
              </a>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleCopy}
                  className={`h-9 px-4 rounded-[6px] text-[11px] font-bold tracking-[0.12em] uppercase transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#151922] ${
                    copied ? 'bg-[#50CFA6] text-[#0E1117]' : 'bg-[#F2B95F] text-[#0E1117] hover:bg-[#E4A744]'
                  }`}
                >
                  {copied ? '✓ Copied!' : 'Copy'}
                </button>
                <a
                  href={shortUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-9 px-4 inline-flex items-center rounded-[6px] border border-[#2A313D] text-[11px] font-bold tracking-[0.12em] uppercase text-[#A8B0BD] hover:text-[#F5F7FA] hover:border-[#A8B0BD] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#151922]"
                >
                  Open
                </a>
              </div>

              {originalUrl && (
                <div className="pt-2 border-t border-[#2A313D]/60 text-xs text-[#707A8A]">
                  <span className="text-[#707A8A] font-mono text-[10px] uppercase tracking-wider block mb-0.5">Destination</span>
                  <span className="font-mono text-[#A8B0BD] break-all">{originalUrl}</span>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-[#2A313D] space-y-3">
              <div className="text-[11px] font-bold tracking-[0.14em] uppercase text-[#F5F7FA]">
                WANT MORE CONTROL?
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-[#A8B0BD]">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#F2B95F]" aria-hidden="true" />
                  <span>Custom aliases</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#F2B95F]" aria-hidden="true" />
                  <span>Click tracking</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#F2B95F]" aria-hidden="true" />
                  <span>Analytics</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#F2B95F]" aria-hidden="true" />
                  <span>Link management</span>
                </div>
              </div>
              <div className="pt-2 flex flex-wrap items-center gap-3">
                <a
                  href="#signup"
                  className="h-9 px-4 inline-flex items-center rounded-[6px] border border-[#F2B95F]/50 bg-[#F2B95F]/10 text-[#F2B95F] text-[11px] font-bold tracking-[0.12em] uppercase hover:bg-[#F2B95F] hover:text-[#0E1117] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#151922]"
                >
                  Create free account →
                </a>
                {onReset && (
                  <button
                    type="button"
                    onClick={onReset}
                    className="h-9 px-4 rounded-[6px] border border-[#2A313D] text-[11px] font-semibold tracking-[0.12em] uppercase text-[#A8B0BD] hover:text-[#F5F7FA] hover:border-[#A8B0BD] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#151922] cursor-pointer"
                  >
                    Shorten another link
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
