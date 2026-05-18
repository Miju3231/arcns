import { TLD } from "@/lib/contracts";

export function Footer() {
  return (
    <footer className="border-t border-white/8 py-8 px-4">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <span className="text-white font-black text-[9px] tracking-tight">NS</span>
          </div>
          <span className="text-white/60 text-sm font-medium">
            ArcNS — Arc Name Service
          </span>
          <span className="text-white/20 text-sm">·</span>
          <span className="text-white/30 text-xs">.{TLD} on Arc Testnet</span>
        </div>

        <a
          href="https://x.com/0xjuiceee"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all group"
        >
          <svg
            className="w-3.5 h-3.5 text-white/50 group-hover:text-white transition-colors"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.747l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.911-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
          <span className="text-white/50 text-xs group-hover:text-white transition-colors">
            Built by <span className="font-semibold text-white/70 group-hover:text-white">@0xjuiceee</span>
          </span>
        </a>
      </div>
    </footer>
  );
}
