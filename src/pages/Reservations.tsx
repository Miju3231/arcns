import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { useWeb3Modal } from "@web3modal/wagmi/react";
import { Link } from "wouter";
import { listRegistrations, getRegistrationsByWallet, type RegistrationRecord } from "@/lib/api";
import { TLD } from "@/lib/contracts";
import { formatAddress } from "@/lib/ens-utils";
import { EXPLORER_URL } from "@/lib/wagmi";
import { SearchBar } from "@/components/SearchBar";

type ViewMode = "all" | "mine";

export default function Reservations() {
  const { address, isConnected } = useAccount();
  const { open } = useWeb3Modal();
  const [records, setRecords] = useState<RegistrationRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("all");

  const fetchData = async (mode: ViewMode) => {
    setLoading(true);
    setError(null);
    try {
      if (mode === "mine" && address) {
        const res = await getRegistrationsByWallet(address);
        setRecords(res.data);
        setTotal(res.total);
      } else {
        const res = await listRegistrations();
        setRecords(res.data);
        setTotal(res.total);
      }
    } catch {
      setError("Could not load registration records. Make sure the API server is running.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(viewMode);
  }, [viewMode, address]);

  const handleExportCSV = () => {
    const headers = ["Domain", "Wallet Address", "Tx Hash", "Duration (years)", "Chain ID", "Registered At"];
    const rows = records.map((r) => [
      `${r.domainName}.${TLD}`,
      r.walletAddress,
      r.txHash ?? "",
      r.durationYears,
      r.chainId,
      new Date(r.registeredAt).toISOString(),
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `arcns-registrations-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen pt-20 sm:pt-24 pb-16 px-3 sm:px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-5 sm:mb-8">
          <div className="flex items-start justify-between gap-3 mb-4 sm:mb-6">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white">Reservations</h1>
              <p className="text-white/40 text-xs sm:text-sm mt-0.5">
                Saved registrations for mainnet migration — {total} record{total !== 1 ? "s" : ""}
              </p>
            </div>
            <button
              onClick={handleExportCSV}
              disabled={records.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-white/70 hover:text-white text-xs sm:text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export CSV
            </button>
          </div>

          <SearchBar size="sm" />
        </div>

        {/* Info Banner */}
        <div className="flex items-start gap-3 p-4 rounded-xl bg-indigo-500/8 border border-indigo-500/20 mb-5 sm:mb-6">
          <svg className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-indigo-300/80 text-xs sm:text-sm leading-relaxed">
            Every .arc domain registered on testnet is automatically saved here. Use this list to reserve names on the Arc mainnet when it launches. Export as CSV to keep a local backup.
          </p>
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-white/5 border border-white/8 mb-5 w-fit">
          {(["all", "mine"] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => {
                if (mode === "mine" && !isConnected) { open(); return; }
                setViewMode(mode);
              }}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize ${
                viewMode === mode
                  ? "bg-white/10 text-white"
                  : "text-white/40 hover:text-white/70"
              }`}
            >
              {mode === "mine" ? (isConnected ? "My registrations" : "My registrations 🔒") : "All registrations"}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="rounded-xl sm:rounded-2xl bg-white/3 border border-white/8 overflow-hidden">
          {/* Table header */}
          <div className="hidden sm:grid grid-cols-[1fr_1fr_auto_auto_auto] gap-3 px-5 py-3 border-b border-white/8 text-xs text-white/30 font-medium uppercase tracking-wider">
            <span>Domain</span>
            <span>Wallet</span>
            <span>Duration</span>
            <span>Registered</span>
            <span>Tx</span>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-white/30 text-sm">Loading records...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 px-4 text-center">
              <svg className="w-8 h-8 text-red-400/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p className="text-red-400 text-sm font-medium">Failed to load</p>
              <p className="text-white/30 text-xs">{error}</p>
              <button onClick={() => fetchData(viewMode)} className="mt-2 text-indigo-400 text-xs hover:text-indigo-300">
                Try again
              </button>
            </div>
          ) : records.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-center px-4">
              <div className="w-12 h-12 rounded-2xl bg-white/3 border border-white/8 flex items-center justify-center mb-2">
                <svg className="w-6 h-6 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
              </div>
              <p className="text-white/50 font-medium text-sm">No records yet</p>
              <p className="text-white/25 text-xs mb-4">Register a .{TLD} domain to see it saved here.</p>
              <Link href="/">
                <span className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium cursor-pointer transition-colors">
                  Register a name
                </span>
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {records.map((r) => (
                <div key={r.id} className="px-4 sm:px-5 py-3.5 hover:bg-white/2 transition-colors">
                  {/* Mobile layout */}
                  <div className="flex items-center justify-between gap-3 sm:hidden">
                    <div>
                      <Link href={`/domain/${r.domainName}`}>
                        <span className="text-white text-sm font-medium hover:text-indigo-300 cursor-pointer">
                          {r.domainName}<span className="text-white/40">.{TLD}</span>
                        </span>
                      </Link>
                      <p className="text-white/30 text-xs font-mono mt-0.5">{formatAddress(r.walletAddress)}</p>
                      <p className="text-white/20 text-xs mt-0.5">{new Date(r.registeredAt).toLocaleDateString()} · {r.durationYears}yr</p>
                    </div>
                    {r.txHash && (
                      <a
                        href={`${EXPLORER_URL}/tx/${r.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-400/60 hover:text-indigo-400 text-xs flex-shrink-0"
                      >
                        Tx ↗
                      </a>
                    )}
                  </div>

                  {/* Desktop layout */}
                  <div className="hidden sm:grid grid-cols-[1fr_1fr_auto_auto_auto] gap-3 items-center">
                    <Link href={`/domain/${r.domainName}`}>
                      <span className="text-white text-sm font-medium hover:text-indigo-300 cursor-pointer">
                        {r.domainName}<span className="text-white/40">.{TLD}</span>
                      </span>
                    </Link>
                    <a
                      href={`${EXPLORER_URL}/address/${r.walletAddress}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-white/40 text-xs font-mono hover:text-white/60 transition-colors"
                    >
                      {formatAddress(r.walletAddress)}
                    </a>
                    <span className="text-white/40 text-xs">{r.durationYears}yr</span>
                    <span className="text-white/30 text-xs whitespace-nowrap">
                      {new Date(r.registeredAt).toLocaleDateString()}
                    </span>
                    {r.txHash ? (
                      <a
                        href={`${EXPLORER_URL}/tx/${r.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-400/60 hover:text-indigo-400 text-xs transition-colors"
                      >
                        ↗
                      </a>
                    ) : (
                      <span className="text-white/20 text-xs">—</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {records.length > 0 && (
            <div className="px-5 py-3 border-t border-white/5 flex items-center justify-between">
              <span className="text-white/30 text-xs">{records.length} of {total} records</span>
              <button onClick={handleExportCSV} className="text-indigo-400/60 hover:text-indigo-400 text-xs transition-colors">
                Export CSV ↓
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
