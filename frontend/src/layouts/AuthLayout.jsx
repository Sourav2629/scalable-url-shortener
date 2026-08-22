import { Outlet } from 'react-router-dom';
import Logo from '../components/brand/Logo';

export default function AuthLayout() {
  return (
    <div className="min-h-screen bg-[#0E1117] flex flex-col">
      {/* Top nav bar */}
      <header className="w-full bg-[#0E1117]/95 backdrop-blur border-b border-[#2A313D] sticky top-0 z-50">
        <div className="w-full max-w-[1440px] mx-auto px-5 md:px-6 lg:px-8 h-[72px] flex items-center justify-between">
          <a href="/" className="flex items-center min-w-0" aria-label="LinkSphere home">
            <div className="md:hidden">
              <Logo markOnly className="w-8 h-8" />
            </div>
            <div className="hidden md:block">
              <Logo className="w-8 h-8" />
            </div>
          </a>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex items-center justify-center px-5 py-12 md:py-16">
        <div className="w-full max-w-[1100px]">
          <div className="grid lg:grid-cols-[1fr_1fr] gap-10 lg:gap-16 items-center">
            {/* Left: Brand message */}
            <div className="hidden lg:block">
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#151922] border border-[#2A313D] text-[10px] font-mono font-semibold tracking-[0.14em] uppercase text-[#707A8A] mb-5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#F2B95F]" aria-hidden="true" />
                LINKSPHERE
              </div>

              <h1 className="text-[38px] lg:text-[44px] font-extrabold tracking-[-0.03em] leading-[1.04] mb-4 text-[#F5F7FA]">
                TAKE CONTROL<br />OF YOUR LINKS.
              </h1>

              <p className="text-[16px] text-[#A8B0BD] leading-[1.6] mb-8 max-w-[400px]">
                Manage custom aliases, tracking and analytics from one workspace.
              </p>

              <div className="border border-[#2A313D] bg-[#151922] rounded-[10px] p-5 max-w-[400px]">
                <div className="text-[10px] font-semibold tracking-[0.16em] uppercase text-[#707A8A] mb-4">
                  WHAT YOU UNLOCK
                </div>
                <ul className="space-y-3">
                  {[
                    'Custom aliases',
                    'Link management',
                    'Click analytics',
                    'Link controls',
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-2.5 text-sm text-[#A8B0BD]">
                      <span className="text-[#50CFA6] text-xs font-bold" aria-hidden="true">✓</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Right: Form outlet */}
            <div className="w-full max-w-[460px] lg:justify-self-end mx-auto">
              <Outlet />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}