import { useState } from 'react';

export default function UrlResultCard({ urlData, result: resultProp, onReset }) {
  const [copied, setCopied] = useState(false);

  const data = urlData || resultProp || {};
  const baseUrl = import.meta.env.VITE_API_BASE_URL || window.location.origin;
  const cleanBaseUrl = baseUrl.replace(/\/api\/v1\/?$/, '').replace(/\/+$/, '');

  const shortUrl = data.shortUrl || (data.shortCode ? `${cleanBaseUrl}/${data.shortCode}` : '');
  const originalUrl = data.originalUrl || '';

  const handleCopy = async () => {
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
    <div className="w-full max-w-[620px] mx-auto border border-[#2A313D] bg-[#151922] rounded-[10px] shadow-[0_16px_34px_rgba(0,0,0,0.28)]">
      <div className="px-6 md:px-8 py-5 border-b border-[#2A313D] flex items-center justify-between">
        <span className="text-[10px] font-semibold tracking-[0.16em] uppercase text-[#707A8A]">Your short link</span>
        <button
          type="button"
          onClick={onReset}
          className="text-[10px] font-semibold tracking-[0.12em] uppercase text-[#A8B0BD] hover:text-[#F5F7FA] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#151922] rounded-sm"
        >
          ← Shorten another
        </button>
      </div>

      <div className="p-6 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <a
            href={shortUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[26px] leading-tight font-bold text-[#F5F7FA] hover:text-[#F2B95F] transition-colors truncate flex-1"
          >
            {shortUrl}
          </a>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCopy}
              className={`h-11 px-5 text-[11px] font-bold tracking-[0.12em] uppercase transition-colors cursor-pointer rounded-[8px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#151922] ${
                copied
                  ? 'bg-[#50CFA6] text-[#0E1117]'
                  : 'bg-[#F2B95F] text-[#0E1117] hover:bg-[#E4A744]'
              }`}
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
            <a
              href={shortUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="h-11 px-5 text-[11px] font-bold tracking-[0.12em] uppercase border border-[#2A313D] text-[#A8B0BD] hover:text-[#F5F7FA] hover:border-[#A8B0BD] transition-colors flex items-center justify-center rounded-[8px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#151922]"
            >
              Open
            </a>
          </div>
        </div>

        <div className="space-y-1">
          <div className="text-[10px] font-semibold tracking-[0.16em] uppercase text-[#707A8A]">Destination</div>
          <div className="font-mono text-xs text-[#A8B0BD] break-all" title={originalUrl}>{originalUrl}</div>
        </div>
      </div>

      <div className="px-6 md:px-8 py-5 border-t border-[#2A313D]">
        <p className="text-sm text-[#A8B0BD] mb-4">Want more control?</p>
        <div className="grid grid-cols-2 gap-3 mb-5 text-xs text-[#A8B0BD]">
          {['Custom aliases', 'Click tracking', 'Analytics', 'Link management'].map((item) => (
            <div key={item} className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[#F2B95F]" aria-hidden="true" />
              <span>{item}</span>
            </div>
          ))}
        </div>
        <a
          href="#signup"
          className="inline-block text-[11px] font-bold tracking-[0.12em] uppercase text-[#F2B95F] hover:text-[#E4A744] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#151922] rounded-sm"
        >
          Create free account →
        </a>
      </div>
    </div>
  );
}
