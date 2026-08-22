import { useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/layout/Header';
import UrlShortenerForm from '../components/url/UrlShortenerForm';
import { createShortUrl } from '../services/url.service';

const featureAreas = [
  {
    title: 'Customize',
    tag: 'Authenticated feature',
  },
  {
    title: 'Manage',
  },
  {
    title: 'Analyze',
    tag: 'Example data',
  },
];

export default function HomePage() {
  const [createdUrlData, setCreatedUrlData] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const handleShorten = async (originalUrl) => {
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const response = await createShortUrl(originalUrl);
      const payload = response && response.data ? response.data : response;

      if (payload && payload.shortCode) {
        setCreatedUrlData(payload);
      } else {
        setErrorMsg('Unexpected response from server. Please try again.');
      }
    } catch (err) {
      const message = err.response?.data?.message || err.message || 'Failed to shorten URL. Please check server connection.';
      setErrorMsg(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setCreatedUrlData(null);
    setErrorMsg(null);
  };

  return (
    <div className="min-h-screen bg-[#0E1117] text-[#F5F7FA]">
      <Header />

      <main>
        <section className="w-full max-w-[1440px] mx-auto px-5 md:px-6 lg:px-8 pt-8 pb-14 md:pt-12 md:pb-20 lg:min-h-[calc(100vh-72px)] flex items-center scroll-mt-24">
          <div className="grid lg:grid-cols-[minmax(0,0.96fr)_minmax(0,1.04fr)] gap-10 xl:gap-14 items-center w-full">
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#151922] border border-[#2A313D] text-[10px] font-mono font-semibold tracking-[0.14em] uppercase text-[#707A8A] mb-4">
                <span className="w-1.5 h-1.5 rounded-full bg-[#50CFA6]" aria-hidden="true" />
                INSTANT URL SHORTENER
              </div>

              <h1 className="max-w-[540px] text-[36px] sm:text-[44px] md:text-[50px] lg:text-[54px] font-extrabold tracking-[-0.03em] leading-[1.04] mb-4 text-[#F5F7FA]">
                SHORTEN LINKS.<br />KEEP CONTROL.
              </h1>

              <p className="max-w-[480px] text-[15px] sm:text-[16px] text-[#A8B0BD] leading-[1.6] mb-6">
                Create a clean short URL instantly. No account required for basic shortening.
              </p>

              {/* Product Transformation Preview */}
              <div className="mb-7 p-3.5 sm:p-4 rounded-[10px] bg-[#151922] border border-[#2A313D] max-w-[480px]">
                <div className="flex items-center justify-between text-[10px] font-mono tracking-wider text-[#707A8A] uppercase mb-2.5">
                  <span>PRODUCT OVERVIEW</span>
                  <span className="text-[#50CFA6]">INSTANT REDIRECT</span>
                </div>
                <div className="space-y-2 text-xs font-mono">
                  <div className="flex items-center gap-2 p-2 rounded bg-[#1B202B]/80 border border-[#2A313D]/60 text-[#A8B0BD] truncate">
                    <span className="text-[10px] uppercase tracking-wider text-[#707A8A] shrink-0 font-sans font-semibold">LONG URL</span>
                    <span className="truncate text-[#707A8A]">example.com/summer-launch/very-long-url</span>
                  </div>
                  <div className="flex items-center justify-center text-[#707A8A] text-xs py-0.5" aria-hidden="true">
                    ↓
                  </div>
                  <div className="flex items-center justify-between p-2 rounded bg-[#1B202B] border border-[#50CFA6]/30 text-[#F5F7FA]">
                    <div className="flex items-center gap-2 truncate">
                      <span className="text-[10px] uppercase tracking-wider text-[#50CFA6] shrink-0 font-sans font-semibold">SHORT LINK</span>
                      <span className="font-bold text-[#F5F7FA]">lnksp.dev/8Kf92</span>
                    </div>
                    <span className="text-[9px] font-mono tracking-wider text-[#50CFA6] bg-[#50CFA6]/10 px-1.5 py-0.5 rounded border border-[#50CFA6]/20 shrink-0">READY</span>
                  </div>
                </div>
              </div>

              {/* Capability Strip */}
              <div className="pt-5 border-t border-[#2A313D] max-w-[480px]">
                <div className="grid grid-cols-3 gap-2 sm:gap-4">
                  <div className="pr-2">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#50CFA6]" aria-hidden="true" />
                      <span className="text-[#A8B0BD] font-medium text-[11px]">Basic Shortening</span>
                    </div>
                    <div className="font-mono text-[10px] font-bold text-[#50CFA6] uppercase tracking-wider">FREE</div>
                  </div>

                  <div className="px-2 sm:px-3 border-l border-[#2A313D]">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#F2B95F]" aria-hidden="true" />
                      <span className="text-[#A8B0BD] font-medium text-[11px]">Custom Aliases</span>
                    </div>
                    <div className="font-mono text-[9px] sm:text-[10px] font-semibold text-[#F2B95F] uppercase tracking-wider">WITH ACCOUNT</div>
                  </div>

                  <div className="pl-2 sm:pl-3 border-l border-[#2A313D]">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#F2B95F]" aria-hidden="true" />
                      <span className="text-[#A8B0BD] font-medium text-[11px]">Analytics</span>
                    </div>
                    <div className="font-mono text-[9px] sm:text-[10px] font-semibold text-[#F2B95F] uppercase tracking-wider">WITH ACCOUNT</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="w-full lg:justify-self-end">
              <UrlShortenerForm
                onSubmit={handleShorten}
                isLoading={isSubmitting}
                error={errorMsg}
                resultData={createdUrlData}
                onReset={handleReset}
              />
            </div>
          </div>
        </section>

        <section id="features" className="border-t border-[#2A313D] bg-[#151922] scroll-mt-24">
          <div className="w-full max-w-[1440px] mx-auto px-5 md:px-6 lg:px-8 py-16 md:py-20">
            <div className="mb-8 text-[10px] font-semibold tracking-[0.16em] text-[#707A8A] uppercase">
              More than a short link
            </div>

            <div className="grid md:grid-cols-[repeat(3,minmax(0,1fr))] gap-6">
              {featureAreas.map((feature, index) => (
                <article key={feature.title} className="border border-[#2A313D] bg-[#1B202B] p-6 md:p-7 rounded-[10px] min-h-[220px] flex flex-col">
                  <div className="mb-5 text-[10px] font-semibold tracking-[0.16em] text-[#707A8A] uppercase">
                    0{index + 1}
                  </div>
                  <div className="mb-4 text-2xl font-semibold text-[#F5F7FA]">{feature.title}</div>

                  {feature.title === 'Customize' && (
                    <div className="mt-1 space-y-2 text-sm">
                      <div className="text-[10px] font-semibold tracking-[0.14em] uppercase text-[#A8B0BD]">Authenticated feature</div>
                      <div className="text-[10px] font-semibold tracking-[0.14em] uppercase text-[#707A8A]">Generated</div>
                      <div className="font-mono text-[#F5F7FA]">linksphere.app/7xK92p</div>
                      <div className="text-[#707A8A]" aria-hidden="true">↓</div>
                      <div className="text-[10px] font-semibold tracking-[0.14em] uppercase text-[#707A8A]">Authenticated</div>
                      <div className="font-mono text-[#F5F7FA]">linksphere.app/summer-sale</div>
                      <div className="text-[10px] font-semibold tracking-[0.14em] uppercase text-[#50CFA6]">✓ Available</div>
                    </div>
                  )}

                  {feature.title === 'Manage' && (
                    <div className="mt-1 space-y-2 text-sm text-[#A8B0BD]">
                      <div className="flex items-center justify-between border-b border-[#2A313D] pb-2">
                        <span className="font-mono text-[#F5F7FA]">/summer-sale</span>
                        <span className="font-mono">1,248</span>
                      </div>
                      <div className="flex items-center justify-between border-b border-[#2A313D] pb-2">
                        <span className="font-mono text-[#F5F7FA]">/github</span>
                        <span className="font-mono">342</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[#F5F7FA]">/portfolio</span>
                        <span className="font-mono">87</span>
                      </div>
                    </div>
                  )}

                  {feature.title === 'Analyze' && (
                    <div className="mt-1 space-y-3">
                      <div>
                        <div className="font-mono text-2xl text-[#F5F7FA]">1,248</div>
                        <div className="text-[10px] font-semibold tracking-[0.14em] uppercase text-[#A8B0BD]">Total clicks</div>
                      </div>
                      <div className="h-16 border border-[#2A313D] bg-[#151922] rounded-[8px] p-2">
                        <svg viewBox="0 0 260 80" className="w-full h-full" preserveAspectRatio="none" aria-label="Compact analytics preview">
                          <defs>
                            <linearGradient id="sparklineGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#F2B95F" stopOpacity="0.3" />
                              <stop offset="100%" stopColor="#F2B95F" stopOpacity="0" />
                            </linearGradient>
                          </defs>
                          <path d="M0 58 C40 51, 70 40, 104 44 S170 69, 205 39 S236 24, 260 30 V 80 H 0 Z" fill="url(#sparklineGradient)" />
                          <path d="M0 58 C40 51, 70 40, 104 44 S170 69, 205 39 S236 24, 260 30" fill="none" stroke="#F2B95F" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      </div>
                      <div className="text-[10px] font-semibold tracking-[0.14em] uppercase text-[#707A8A]">Example data</div>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="how-it-works" className="w-full max-w-[1440px] mx-auto px-5 md:px-6 lg:px-8 py-16 md:py-20 scroll-mt-24">
          <div className="grid md:grid-cols-[0.9fr_1.1fr] gap-8 md:gap-12 items-center">
            <div>
              <div className="text-[10px] font-semibold tracking-[0.16em] text-[#707A8A] uppercase mb-4">Authenticated feature</div>
              <h2 className="text-3xl md:text-4xl font-extrabold tracking-[-0.03em] mb-4 text-[#F5F7FA]">
                CUSTOMIZE AFTER YOU START.
              </h2>
              <p className="text-[17px] text-[#A8B0BD] leading-[1.58] mb-6">
                Guests can shorten a link immediately. Authenticated users later unlock custom aliases, analytics, and link management.
              </p>
              <p className="text-sm text-[#A8B0BD]">
                The public flow stays simple and familiar while the account experience remains available when it matters.
              </p>
            </div>

            <div className="border border-[#2A313D] bg-[#151922] rounded-[10px] p-6 md:p-8">
              <div className="text-[10px] font-semibold tracking-[0.16em] uppercase text-[#707A8A] mb-4">Generated</div>
              <div className="font-mono text-lg text-[#F5F7FA] mb-5">lnksp.dev/8Kf92</div>
              <div className="text-[#707A8A] text-lg mb-5" aria-hidden="true">↓</div>

              <div className="mb-4 text-[10px] font-semibold tracking-[0.16em] uppercase text-[#707A8A]">Authenticated</div>
              <div className="flex items-center gap-2 border border-[#2A313D] bg-[#0F141D] px-3 py-3 mb-3 rounded-[8px]">
                <span className="font-mono text-sm text-[#A8B0BD]">lnksp.dev/</span>
                <span className="font-mono text-base font-bold text-[#F5F7FA]">summer-sale</span>
              </div>
              <div className="mb-8 text-[10px] font-semibold tracking-[0.14em] uppercase text-[#50CFA6] flex items-center gap-2">
                <span aria-hidden="true">✓</span>
                <span>Available</span>
              </div>

              <div className="border-t border-[#2A313D] pt-4">
                <div className="text-[10px] font-semibold tracking-[0.16em] uppercase text-[#707A8A] mb-2">Final link</div>
                <div className="font-mono text-lg font-bold text-[#F5F7FA]">lnksp.dev/summer-sale</div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-[#2A313D] bg-[#151922] scroll-mt-24">
          <div className="w-full max-w-[1440px] mx-auto px-5 md:px-6 lg:px-8 py-16 md:py-20">
            <div className="mb-8 text-[10px] font-semibold tracking-[0.16em] text-[#707A8A] uppercase">Example analytics preview</div>

            <div className="grid md:grid-cols-[1.2fr_0.8fr] gap-8">
              <div className="border border-[#2A313D] bg-[#1B202B] rounded-[10px] p-6 md:p-8">
                <div className="text-4xl md:text-5xl font-extrabold tracking-[-0.04em] text-[#F5F7FA]">1,248</div>
                <div className="mt-2 text-[10px] font-semibold tracking-[0.16em] uppercase text-[#A8B0BD]">Total clicks</div>
                <div className="mt-4 text-[10px] font-semibold tracking-[0.16em] uppercase text-[#707A8A]">Example data • Last 30 days</div>
                <div className="mt-6 h-56 md:h-64 border border-[#2A313D] bg-[#0F141D] p-3 rounded-[8px]">
                  <svg viewBox="0 0 600 160" className="w-full h-full" preserveAspectRatio="none" aria-label="Example analytics chart preview">
                    <defs>
                      <linearGradient id="analyticsChartGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#F2B95F" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="#F2B95F" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <g stroke="#2A313D" strokeWidth="1" strokeDasharray="3 3">
                      <path d="M0 20 H600" />
                      <path d="M0 60 H600" />
                      <path d="M0 100 H600" />
                      <path d="M0 140 H600" />
                    </g>
                    <path d="M0 110 C90 95, 100 88, 150 72 S260 44, 300 70 S380 110, 430 82 S520 30, 600 40 V 160 H 0 Z" fill="url(#analyticsChartGradient)" />
                    <path d="M0 110 C90 95, 100 88, 150 72 S260 44, 300 70 S380 110, 430 82 S520 30, 600 40" fill="none" stroke="#F2B95F" strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                </div>
              </div>

              <div className="space-y-8">
                <div className="border border-[#2A313D] bg-[#1B202B] rounded-[10px] p-5 md:p-6">
                  <div className="mb-4 text-[10px] font-semibold tracking-[0.16em] uppercase text-[#A8B0BD]">Traffic sources</div>
                  <div className="space-y-2 text-sm">
                    {[
                      ['Direct', '52%'],
                      ['Search', '27%'],
                      ['Social', '15%'],
                      ['Other', '6%'],
                    ].map(([label, value]) => (
                      <div key={label} className="flex items-center justify-between">
                        <span className="text-[#A8B0BD]">{label}</span>
                        <span className="font-mono font-semibold text-[#F5F7FA]">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border border-[#2A313D] bg-[#1B202B] rounded-[10px] p-5 md:p-6">
                  <div className="mb-4 text-[10px] font-semibold tracking-[0.16em] uppercase text-[#A8B0BD]">Devices</div>
                  <div className="space-y-2 text-sm">
                    {[
                      ['Desktop', '62%'],
                      ['Mobile', '34%'],
                      ['Tablet', '4%'],
                    ].map(([label, value]) => (
                      <div key={label} className="flex items-center justify-between">
                        <span className="text-[#A8B0BD]">{label}</span>
                        <span className="font-mono font-semibold text-[#F5F7FA]">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="w-full max-w-[1440px] mx-auto px-5 md:px-6 lg:px-8 py-16 md:py-20 scroll-mt-24">
          <div className="mb-8 text-[10px] font-semibold tracking-[0.16em] text-[#707A8A] uppercase">Your links preview</div>
          <div className="border border-[#2A313D] bg-[#151922] rounded-[10px] overflow-hidden">
            <div className="flex items-center justify-between border-b border-[#2A313D] px-5 py-4">
              <div className="text-sm font-semibold text-[#F5F7FA]">YOUR LINKS</div>
              <button className="h-10 border border-[#2A313D] bg-[#1B202B] text-[#A8B0BD] px-4 text-[11px] font-semibold tracking-[0.1em] uppercase rounded-[8px] hover:border-[#F2B95F] hover:text-[#F2B95F] transition-colors">
                + Create link
              </button>
            </div>

            {[
              ['/summer-sale', 'lnksp.dev/summer-sale', '1,248 clicks'],
              ['/github', 'lnksp.dev/github', '342 clicks'],
              ['/portfolio', 'lnksp.dev/portfolio', '87 clicks'],
            ].map(([alias, url, clicks]) => (
              <div
                key={alias}
                className="group grid md:grid-cols-[1.1fr_auto_auto] md:items-center gap-3 border-b border-[#2A313D] px-5 py-4 last:border-b-0 hover:bg-[#1B202B]/80 transition-colors cursor-pointer"
              >
                <div>
                  <div className="font-mono text-[15px] font-semibold text-[#F5F7FA] group-hover:text-[#F2B95F] transition-colors flex items-center gap-2">
                    <span>{alias}</span>
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity text-[12px] text-[#F2B95F]" aria-hidden="true">→</span>
                  </div>
                  <div className="font-mono text-[12px] text-[#A8B0BD]">{url}</div>
                </div>
                <div className="font-mono font-semibold text-sm text-[#F5F7FA]">{clicks}</div>
                <span className="text-[10px] font-semibold tracking-[0.14em] uppercase text-[#50CFA6] bg-[#50CFA6]/10 px-2 py-1 rounded-[4px] border border-[#50CFA6]/20 inline-self-start md:inline-self-auto">
                  Active
                </span>
              </div>
            ))}
          </div>
        </section>

        <section id="signup" className="w-full max-w-[1440px] mx-auto px-5 md:px-6 lg:px-8 py-16 md:py-24 scroll-mt-24">
          <div className="border border-[#2A313D] bg-[#151922] rounded-[10px] px-6 py-8 md:px-10 md:py-12 text-center">
            <div className="text-[10px] font-semibold tracking-[0.16em] text-[#707A8A] uppercase mb-4">Create free account</div>
            <h2 className="text-3xl md:text-5xl font-extrabold tracking-[-0.03em] text-[#F5F7FA] leading-tight mb-4">
              GET MORE FROM EVERY LINK.
            </h2>
            <p className="mx-auto max-w-xl text-base text-[#A8B0BD] leading-relaxed mb-8">
              Create a free LinkSphere account for custom aliases, link management, and analytics.
            </p>
            <Link to="/register" className="h-12 bg-[#F2B95F] text-[#0E1117] px-6 text-[11px] font-bold tracking-[0.12em] uppercase rounded-[8px] hover:bg-[#E4A744] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#151922] inline-flex items-center justify-center">
              Create free account →
            </Link>
            <p id="signin" className="mt-5 text-sm text-[#A8B0BD]">
              Already have an account?{' '}
              <Link to="/login" className="text-[#F2B95F] hover:text-[#E4A744] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B95F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#151922] rounded-sm">
                Sign in
              </Link>
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
