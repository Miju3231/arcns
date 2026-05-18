import { useState } from "react";
import { useWeb3Modal } from "@web3modal/wagmi/react";
import { useAccount, useDisconnect, useChainId, useSwitchChain } from "wagmi";
import { Link, useLocation } from "wouter";
import { formatAddress } from "@/lib/ens-utils";
import { EXPLORER_URL, WALLETCONNECT_PROJECT_ID, ARC_CHAIN_ID } from "@/lib/wagmi";

export function Header() {
  const { open } = useWeb3Modal();
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isWrongNetwork = isConnected && chainId !== ARC_CHAIN_ID;
  const hasWalletConnect = !!WALLETCONNECT_PROJECT_ID;

  const navLinks = [
    { href: "/", label: "Home" },
    { href: "/my-domains", label: "My Names" },
    { href: "/explore", label: "Explore" },
    { href: "/reservations", label: "Reservations" },
  ];

  const handleConnect = () => {
    if (!hasWalletConnect) {
      // MetaMask direct fallback when no WalletConnect project ID configured
      if (typeof window !== "undefined" && window.ethereum) {
        window.ethereum
          .request({ method: "eth_requestAccounts" })
          .catch(console.error);
      } else {
        alert("Please install MetaMask or set VITE_WALLETCONNECT_PROJECT_ID in your environment.");
      }
      return;
    }
    open();
  };

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-black/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 h-14 sm:h-16 flex items-center justify-between gap-3">
          {/* Logo */}
          <Link href="/" onClick={() => setMobileOpen(false)}>
            <div className="flex items-center gap-2 cursor-pointer">
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30 flex-shrink-0">
                <span className="text-white font-black text-[10px] tracking-tight">NS</span>
              </div>
              <span className="font-bold text-white text-base sm:text-lg tracking-tight">
                Arc<span className="text-indigo-400">NS</span>
              </span>
            </div>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1 flex-1 justify-center">
            {navLinks.map(({ href, label }) => (
              <Link key={href} href={href}>
                <span
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                    location === href
                      ? "bg-white/10 text-white"
                      : "text-white/60 hover:text-white hover:bg-white/5"
                  }`}
                >
                  {label}
                </span>
              </Link>
            ))}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2">
            {/* Wrong network indicator */}
            {isWrongNetwork && (
              <button
                onClick={() => switchChain({ chainId: ARC_CHAIN_ID })}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-medium hover:bg-amber-500/15 transition-colors"
              >
                ⚠ Switch Network
              </button>
            )}

            {isConnected && address ? (
              <div className="flex items-center gap-1.5">
                <a
                  href={`${EXPLORER_URL}/address/${address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isWrongNetwork ? "bg-amber-400" : "bg-emerald-400 animate-pulse"
                    }`}
                  />
                  {formatAddress(address)}
                </a>
                {/* Mobile short address */}
                <a
                  href={`${EXPLORER_URL}/address/${address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="sm:hidden flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-white/80"
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${isWrongNetwork ? "bg-amber-400" : "bg-emerald-400 animate-pulse"}`} />
                  {formatAddress(address, 3)}
                </a>
                <button
                  onClick={() => disconnect()}
                  className="hidden sm:block px-3 py-1.5 rounded-lg text-sm text-white/50 hover:text-white/80 hover:bg-white/5 transition-colors"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                onClick={handleConnect}
                className="px-3 sm:px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-medium transition-colors shadow-lg shadow-indigo-500/20 whitespace-nowrap"
              >
                Connect
              </button>
            )}

            {/* Hamburger */}
            <button
              onClick={() => setMobileOpen((v) => !v)}
              className="md:hidden flex flex-col justify-center items-center w-8 h-8 gap-1.5 rounded-lg hover:bg-white/5 transition-colors"
              aria-label="Toggle menu"
            >
              <span className={`block w-5 h-0.5 bg-white/70 rounded-full transition-all ${mobileOpen ? "rotate-45 translate-y-2" : ""}`} />
              <span className={`block w-5 h-0.5 bg-white/70 rounded-full transition-all ${mobileOpen ? "opacity-0" : ""}`} />
              <span className={`block w-5 h-0.5 bg-white/70 rounded-full transition-all ${mobileOpen ? "-rotate-45 -translate-y-2" : ""}`} />
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="md:hidden border-t border-white/10 bg-black/95 backdrop-blur-xl">
            <nav className="px-4 py-3 flex flex-col gap-1">
              {navLinks.map(({ href, label }) => (
                <Link key={href} href={href} onClick={() => setMobileOpen(false)}>
                  <span
                    className={`flex items-center px-4 py-3 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                      location === href
                        ? "bg-indigo-500/15 text-white border border-indigo-500/20"
                        : "text-white/60 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    {label}
                  </span>
                </Link>
              ))}
              {isWrongNetwork && (
                <button
                  onClick={() => { switchChain({ chainId: ARC_CHAIN_ID }); setMobileOpen(false); }}
                  className="flex items-center px-4 py-3 rounded-xl text-sm text-amber-300 hover:bg-amber-500/5 text-left"
                >
                  ⚠ Switch to Arc Testnet
                </button>
              )}
              {isConnected && address && (
                <button
                  onClick={() => { disconnect(); setMobileOpen(false); }}
                  className="flex items-center px-4 py-3 rounded-xl text-sm text-red-400/80 hover:text-red-400 hover:bg-red-500/5 transition-colors text-left"
                >
                  Disconnect wallet
                </button>
              )}
            </nav>
          </div>
        )}
      </header>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
    </>
  );
}
