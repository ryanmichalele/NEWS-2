const nav = ["US", "World", "Politics", "Business", "Markets", "Tech", "Health"];

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-zinc-800 bg-black text-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center bg-red-600 text-xs font-black tracking-tighter">
              CWN
            </div>
            <div>
              <p className="text-lg font-black uppercase tracking-tighter leading-none">
                CWN <span className="text-red-600">Live</span>
              </p>
              <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-zinc-400">
                Markets Desk
              </p>
            </div>
          </div>
          <nav className="ml-4 hidden items-center gap-4 text-xs font-bold uppercase tracking-widest text-zinc-300 md:flex">
            {nav.map((item) => (
              <a
                key={item}
                href="#report"
                className={`transition hover:text-white ${
                  item === "Markets" ? "text-white underline decoration-red-600 decoration-2 underline-offset-4" : ""
                }`}
              >
                {item}
              </a>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-[10px] font-bold uppercase tracking-widest text-zinc-500 sm:inline">
            August 16, 2026
          </span>
          <a
            href="#protect"
            className="bg-red-600 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white transition hover:bg-red-700"
          >
            Safety Guide
          </a>
        </div>
      </div>
    </header>
  );
}
