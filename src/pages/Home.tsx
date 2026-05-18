import { TLD } from "@/lib/contracts";
import { ArcHero } from "@/components/hero/ArcHero";

const FEATURED_NAMES = [
  "satoshi", "ethereum", "defi", "nft", "dao", "web3", "arc", "genesis",
];

export default function Home() {
  return (
    <div className="min-h-screen bg-black">
      {/* Cinematic watermark hero */}
      <ArcHero />

      {/* Featured pills */}
      <section className="relative px-4 pb-10">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">
            Featured names
          </p>
          <div className="flex flex-wrap justify-center gap-2 px-2">
            {FEATURED_NAMES.slice(0, 8).map((name) => (
              <a
                key={name}
                href={`/domain/${name}`}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/50 transition-all hover:border-indigo-500/40 hover:bg-indigo-500/10 hover:text-white sm:text-sm"
              >
                {name}.{TLD}
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 sm:py-24 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
            {[
              {
                icon: (
                  <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" />
                  </svg>
                ),
                title: "Decentralized Identity",
                desc: "Own your .arc name as an NFT. No censorship — you control it.",
              },
              {
                icon: (
                  <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                ),
                title: "Human-readable Addresses",
                desc: "Replace your 0x address with something memorable.",
              },
              {
                icon: (
                  <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582 4 8 4m0 0v4" />
                  </svg>
                ),
                title: "Onchain Records",
                desc: "Store your addresses, socials, and website — all on-chain.",
              },
            ].map(({ icon, title, desc }) => (
              <div key={title} className="p-5 sm:p-6 rounded-2xl bg-white/3 border border-white/8 hover:border-white/15 transition-colors">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mb-3 sm:mb-4">
                  {icon}
                </div>
                <h3 className="text-white font-semibold text-base sm:text-lg mb-1 sm:mb-2">{title}</h3>
                <p className="text-white/50 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 sm:py-24 px-4 bg-gradient-to-b from-transparent to-indigo-950/20">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl sm:text-4xl font-bold text-white mb-3 sm:mb-4">How it works</h2>
          <p className="text-white/50 mb-10 sm:mb-12 text-sm sm:text-base">Register your .arc name in three simple steps</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8">
            {[
              { step: "01", title: "Search a name", desc: "Find an available .arc name that represents you." },
              { step: "02", title: "Register it", desc: "Claim it on-chain with your wallet. Two transactions required." },
              { step: "03", title: "Configure", desc: "Point it to your wallet address and start using it." },
            ].map(({ step, title, desc }) => (
              <div key={step} className="relative flex sm:flex-col items-start sm:items-center gap-4 sm:gap-0 p-4 sm:p-0 rounded-xl sm:rounded-none bg-white/2 sm:bg-transparent border border-white/5 sm:border-0">
                <div className="text-3xl sm:text-5xl font-black text-indigo-500/20 sm:mb-3 flex-shrink-0">{step}</div>
                <div className="text-left sm:text-center">
                  <h3 className="text-white font-semibold text-base sm:text-lg mb-1 sm:mb-2">{title}</h3>
                  <p className="text-white/40 text-sm">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
