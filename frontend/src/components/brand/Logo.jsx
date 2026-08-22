export default function Logo({ markOnly = false, className = '' }) {
  const mark = (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="16" cy="16" r="3.2" fill="#F5F7FA" />
      <path
        d="M16 4.75C9.74 4.75 4.75 9.82 4.75 16.09C4.75 22.37 9.74 27.25 16.02 27.25C21.22 27.25 25.42 23.88 26.86 19.3"
        stroke="#F2B95F"
        strokeWidth="2.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M26.86 19.3H21.8"
        stroke="#F2B95F"
        strokeWidth="2.35"
        strokeLinecap="round"
      />
      <path
        d="M21.8 19.3L24.7 16.38"
        stroke="#F2B95F"
        strokeWidth="2.35"
        strokeLinecap="round"
      />
    </svg>
  );

  if (markOnly) {
    return mark;
  }

  return (
    <div className="flex items-center gap-2.5 leading-none">
      {mark}
      <span className="text-[18px] tracking-tight">
        <span className="font-medium text-[#A8B0BD]">Link</span>
        <span className="font-bold text-[#F5F7FA]">Sphere</span>
      </span>
    </div>
  );
}
