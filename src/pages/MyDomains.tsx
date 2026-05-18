import { useAccount, usePublicClient, useChainId } from "wagmi";
import { useWeb3Modal } from "@web3modal/wagmi/react";
import { Link } from "wouter";
import { SearchBar } from "@/components/SearchBar";
import {
  TLD,
  REGISTRAR_ADDRESS,
  REGISTRY_ADDRESS,
  RESOLVER_ADDRESS,
  BASE_REGISTRAR_ABI,
  REGISTRY_ABI,
  RESOLVER_ABI,
  reverseNode,
} from "@/lib/contracts";
import { formatAddress, formatExpiry, sameAddress } from "@/lib/ens-utils";
import { ARC_CHAIN_ID } from "@/lib/wagmi";
import { useEffect, useState } from "react";
import { parseAbiItem } from "viem";
import { getRegistrationsByWallet } from "@/lib/api";
import { scanLogsChunked } from "@/lib/scan-logs";

interface OwnedDomain {
  name: string;
  expires: bigint;
  source: "nft" | "chain" | "local";
}

// Scan at most this many recent blocks when falling back to logs.
const MAX_SCAN_BLOCKS = 100_000n;

export default function MyDomains() {
  const { address, isConnected } = useAccount();
  const { open } = useWeb3Modal();

  const publicClient = usePublicClient();
  const chainId = useChainId();

  const [domains, setDomains] = useState<OwnedDomain[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCorrectChain = chainId === ARC_CHAIN_ID;

  useEffect(() => {
    if (!address || !publicClient || !isCorrectChain) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    const run = async () => {
      const byName = new Map<string, OwnedDomain>();

      // 1) Local-storage cache — instant render.
      try {
        const { data: local } = await getRegistrationsByWallet(address);
        for (const r of local) {
          if (!byName.has(r.domainName)) {
            byName.set(r.domainName, { name: r.domainName, expires: 0n, source: "local" });
          }
        }
        if (!cancelled) setDomains(Array.from(byName.values()));
      } catch (e) {
        console.warn("[MyDomains] local fetch failed:", e);
      }

      // 2) ERC721 enumeration — primary on-chain source.
      let enumWorked = false;
      try {
        const balance = (await publicClient.readContract({
          address: REGISTRAR_ADDRESS,
          abi: BASE_REGISTRAR_ABI,
          functionName: "balanceOf",
          args: [address],
        })) as bigint;

        if (balance > 0n) {
          const limit = Number(balance > 100n ? 100n : balance);
          for (let i = 0; i < limit; i++) {
            try {
              const tokenId = (await publicClient.readContract({
                address: REGISTRAR_ADDRESS,
                abi: BASE_REGISTRAR_ABI,
                functionName: "tokenOfOwnerByIndex",
                args: [address, BigInt(i)],
              })) as bigint;

              let expires = 0n;
              try {
                expires = (await publicClient.readContract({
                  address: REGISTRAR_ADDRESS,
                  abi: BASE_REGISTRAR_ABI,
                  functionName: "nameExpires",
                  args: [tokenId],
                })) as bigint;
              } catch {
                /* not all registrars expose nameExpires */
              }

              // Recover label via reverse lookup on the resolver (best effort).
              let label = `token-${tokenId.toString(16).slice(0, 10)}`;
              try {
                const reverse = (await publicClient.readContract({
                  address: RESOLVER_ADDRESS,
                  abi: RESOLVER_ABI,
                  functionName: "name",
                  args: [reverseNode(address)],
                })) as string;
                if (reverse && reverse.endsWith(`.${TLD}`)) {
                  label = reverse.replace(new RegExp(`\\.${TLD}$`), "");
                }
              } catch {
                /* ignore */
              }

              if (!byName.has(label) || byName.get(label)!.source === "local") {
                byName.set(label, { name: label, expires, source: "nft" });
              }
            } catch (innerErr) {
              console.warn("[MyDomains] enum read failed at index", i, innerErr);
            }
          }
          enumWorked = true;
        } else {
          enumWorked = true; // 0 tokens, nothing to do
        }
      } catch (e) {
        console.warn("[MyDomains] enumeration not supported:", e);
      }

      // 3) Fallback: chunked log scan (last MAX_SCAN_BLOCKS only).
      if (!enumWorked) {
        try {
          const latest = await publicClient.getBlockNumber();
          const fromBlock = latest > MAX_SCAN_BLOCKS ? latest - MAX_SCAN_BLOCKS : 0n;

          const logs = await scanLogsChunked({
            client: publicClient,
            address: REGISTRAR_ADDRESS,
            event: parseAbiItem(
              "event NameRegistered(string name, bytes32 indexed label, address indexed owner, uint256 cost, uint256 expires)"
            ),
            args: { owner: address },
            fromBlock,
            toBlock: latest,
            // chunk omitted → uses safe 9_000 default (Arc 10k cap).
            cacheKey: `mine:${REGISTRAR_ADDRESS}:${address}:NameRegistered`,
          });

          for (const log of logs) {
            const args = (log as unknown as { args?: { name?: string; expires?: bigint } }).args ?? {};
            if (!args.name) continue;

            // Filter by registry owner — catches transfers since registration.
            try {
              const onchainOwner = (await publicClient.readContract({
                address: REGISTRY_ADDRESS,
                abi: REGISTRY_ABI,
                functionName: "owner",
                args: [reverseNode(address)],
              })) as string;
              if (onchainOwner && !sameAddress(onchainOwner, address)) {
                // skip — name was transferred away
                continue;
              }
            } catch {
              /* ignore */
            }

            const existing = byName.get(args.name);
            if (!existing || existing.source !== "nft") {
              byName.set(args.name, {
                name: args.name,
                expires: args.expires ?? 0n,
                source: "chain",
              });
            }
          }
        } catch (chainErr) {
          console.warn("[MyDomains] chain scan failed:", chainErr);
        }
      }

      if (!cancelled) setDomains(Array.from(byName.values()));
    };

    run()
      .catch((e: unknown) => {
        console.error(e);
        setError((e as Error)?.message ?? "Failed to load domains");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [address, publicClient, isCorrectChain]);

  if (!isConnected) {
    return (
      <div className="min-h-screen pt-24 px-4 flex flex-col items-center justify-center">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-7 h-7 text-indigo-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
          </div>

          <h2 className="text-xl font-bold text-white mb-2">
            Connect your wallet
          </h2>

          <p className="text-white/50 text-sm mb-6">
            Connect to view and manage your .{TLD} domains
          </p>

          <button
            onClick={() => open()}
            className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors"
          >
            Connect Wallet
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 sm:pt-24 pb-16 px-3 sm:px-4">
      <div className="max-w-3xl mx-auto">
        <div className="mb-5 sm:mb-8">
          <div className="flex items-center justify-between gap-3 mb-4 sm:mb-6">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white">
                My Names
              </h1>

              <p className="text-white/40 text-xs sm:text-sm mt-0.5 font-mono">
                {formatAddress(address!)}
              </p>
            </div>

            <Link href="/">
              <span className="px-3 sm:px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-medium cursor-pointer transition-colors whitespace-nowrap">
                + Register
              </span>
            </Link>
          </div>

          <SearchBar size="sm" />
        </div>

        {!isCorrectChain && (
          <div className="mb-6 p-4 rounded-xl bg-amber-500/8 border border-amber-500/20 text-amber-300 text-sm text-center">
            ⚠ Switch to Arc Testnet to see your on-chain domains
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />

            <p className="text-white/40 text-sm">
              Scanning blockchain for your domains…
            </p>
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-red-400 text-sm mb-3">
              {error}
            </p>

            <button
              onClick={() => window.location.reload()}
              className="text-indigo-400 text-xs hover:text-indigo-300"
            >
              Retry
            </button>
          </div>
        ) : domains.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-white/40">
              No domains found
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {domains.map((d) => {
              const expTs = Number(d.expires);

              const isExpired =
                expTs > 0 &&
                expTs * 1000 < Date.now();

              return (
                <Link
                  key={d.name}
                  href={`/domain/${d.name}`}
                >
                  <div className="group flex items-center justify-between p-4 rounded-xl bg-white/3 border border-white/8 hover:border-indigo-500/40 hover:bg-white/5 transition-all cursor-pointer">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-linear-to-br from-indigo-500/20 to-purple-600/20 border border-indigo-500/20 flex items-center justify-center">
                        <span className="text-indigo-300 font-bold text-sm uppercase">
                          {d.name[0]}
                        </span>
                      </div>

                      <div>
                        <p className="text-white font-medium">
                          {d.name}
                          <span className="text-white/40">
                            .{TLD}
                          </span>
                        </p>

                        <div className="flex items-center gap-2 mt-1">
                          {isExpired ? (
                            <span className="text-xs text-red-400">
                              Expired
                            </span>
                          ) : (
                            <span className="text-xs text-emerald-400">
                              Owned
                            </span>
                          )}

                          {expTs > 0 && (
                            <span className="text-xs text-white/30">
                              Expires {formatExpiry(expTs)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

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
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
