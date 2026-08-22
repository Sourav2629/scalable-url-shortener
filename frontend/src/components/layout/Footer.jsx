export default function Footer() {
  return (
    <footer className="w-full bg-[#0E1117] border-t border-[#2A313D]">
      <div className="w-full max-w-[1440px] mx-auto px-5 md:px-6 lg:px-8 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <p className="text-xs font-medium text-[#707A8A]">
          &copy; {new Date().getFullYear()} LinkSphere
        </p>
        <div className="flex items-center gap-5 text-xs font-medium text-[#707A8A]">
          <span>Brand</span>
          <span>Privacy</span>
          <span>Terms</span>
        </div>
      </div>
    </footer>
  );
}
