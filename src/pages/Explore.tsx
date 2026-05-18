import { usePublicClient, useChainId } from "wagmi";
import { useEffect, useState } from "react";
import { parseAbiItem } from "viem";
import { Link } from "wouter";
import { REGISTRAR_ADDRESS, TLD } from "@/lib/contracts";
import { formatAddress, formatUsdc, formatExpiry } from "@/lib/ens-utils";
import { SearchBar } from "@/components/SearchBar";
import { EXPLORER_URL, ARC_CHAIN_ID } from "@/lib/wagmi";
import { scanLogsChunked } from "@/lib/scan-logs";

interface RecentDomain {
  name: string;
  owner: string;
  cost: bigint;
  expires: bigint;
  txHash: string;
}

// Scan the last ~50k blocks in 2k-block chunks. Safer for Arc RPC than one
// huge `getLogs` call against block 0.
const SCAN_BLOCKS = 50_000n;

export default function Explore() {
  const publicClient = usePublicClient();
  const chainId = useChainId();

  const [recent, setRecent] = useState<RecentDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isCorrectChain = chainId === ARC_CHAIN_ID;

  useEffect(() => {
    if (!publicClient || !isCorrectChain) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const scan = async () => {
      const latest = await publicClient.getBlockNumber();
      const fromBlock = latest > SCAN_BLOCKS ? latest - SCAN_BLOCKS : 0n;

      const logs = await scanLogsChunked({
        client: publicClient,
        address: REGISTRAR_ADDRESS,
        event: parseAbiItem(
          "event NameRegistered(string name, bytes32 indexed label, address indexed owner, uint256 cost, uint256 expires)"
        ),
        fromBlock,
        toBlock: latest,
        // chunk omitted → uses safe 9_000 default (Arc 10k cap).
        cacheKey: `explore:${REGISTRAR_ADDRESS}:NameRegistered`,
        stopWhen: (r) => r.length >= 60, // we only render 30; stop early.
      });

      const found: RecentDomain[] = [];
      for (const log of [...logs].reverse().slice(0, 30)) {
        const args = (log as unknown as {
          args?: { name?: string; owner?: string; cost?: bigint; expires?: bigint };
          transactionHash?: string;
        }).args ?? {};
        if (!args.name) continue;

        found.push({
          name: args.name,
          owner: args.owner ?? "0x",
          cost: args.cost ?? 0n,
          expires: args.expires ?? 0n,
          txHash:
            (log as unknown as { transactionHash?: string }).transactionHash ?? "",
        });
      }

      if (!cancelled) setRecent(found);
    };

    scan()
      .catch((e: unknown) => {
        console.error(e);
        setError((e as Error)?.message ?? "Failed to load recent registrations");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [publicClient, isCorrectChain]);

  return (
    <div className="min-h-screen pt-20 sm:pt-24 pb-16 px-3 sm:px-4">
      <div className="max-w-3xl mx-auto">
        <div className="mb-5 sm:mb-8">
          <h1 className="text-xl sm:text-2xl font-bold text-white mb-1">
            Explore
          </h1>

          <p className="text-white/40 text-sm mb-4 sm:mb-6">
            Recently registered .{TLD} names
          </p>

          <SearchBar size="sm" />
        </div>

        {!isCorrectChain && (
          <div className="mb-6 p-4 rounded-xl bg-amber-500/8 border border-amber-500/20 text-amber-300 text-sm text-center">
            ⚠ Connect to Arc Testnet to explore registered domains
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />

            <p className="text-white/40 text-sm">
              Fetching recent registrations…
            </p>
          </div>
        ) : error ? (
          <div className="text-center py-12 text-red-400 text-sm">
            {error}
          </div>
        ) : recent.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-white/40 text-sm">
              No recent registrations found on Arc Testnet.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {recent.map((d, i) => (
              <Link key={`${d.name}-${i}`} href={`/domain/${d.name}`}>
                <div className="group flex items-center justify-between p-4 rounded-xl bg-white/3 border border-white/8 hover:border-indigo-500/40 hover:bg-white/5 transition-all cursor-pointer">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-linear-to-br from-indigo-500/20 to-purple-600/20 border border-indigo-500/20 flex items-center justify-center shrink-0">
                      <span className="text-indigo-300 font-bold text-sm uppercase">
                        {d.name[0]}
                      </span>
                    </div>

                    <div>
                      <p className="text-white font-medium">
                        {d.name}
                        <span className="text-white/40">.{TLD}</span>
                      </p>

                      <div className="flex items-center gap-2 mt-0.5 text-xs text-white/30">
                        <span>{formatAddress(d.owner)}</span>

                        {d.expires > 0n && (
                          <span>
                            · Expires {formatExpiry(Number(d.expires))}
                          </span>
                        )}

                        {d.cost > 0n && (
                          <span>
                            · {formatUsdc(d.cost, 0)} USDC
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {d.txHash && (
                      <a
                        href={`${EXPLORER_URL}/tx/${d.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-indigo-400/40 hover:text-indigo-400 text-xs transition-colors hidden sm:block"
                      >
                        tx ↗
                      </a>
                    )}

                    <svg
                      className="w-4 h-4 text-white/20 group-hover:text-white/40 transition-colors"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
