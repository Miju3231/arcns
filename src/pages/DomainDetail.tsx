import { useState, useEffect, useRef } from "react";
import { useRoute } from "wouter";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useChainId,
  useSwitchChain,
  usePublicClient,
} from "wagmi";
import { useWeb3Modal } from "@web3modal/wagmi/react";
import { encodeFunctionData, type Address } from "viem";
import {
  REGISTRY_ADDRESS,
  REGISTRAR_ADDRESS,
  BASE_REGISTRAR_ADDRESS,
  RESOLVER_ADDRESS,
  REVERSE_REGISTRAR_ADDRESS,
  REGISTRY_ABI,
  REGISTRAR_ABI,
  RESOLVER_ABI,
  REVERSE_REGISTRAR_ABI,
  BASE_REGISTRAR_ABI,
  getDomainNode,
  tokenIdFromLabel,
  TLD,
  namehash,
} from "@/lib/contracts";
import { toast } from "sonner";
import {
  isValidDomainName,
  isZeroAddress,
  sameAddress,
  getSecondsFromYears,
  formatAddress,
  REGISTRATION_STEPS,
  generateSecret,
  resolvePrice,
  formatUsdc,
} from "@/lib/ens-utils";
import { ARC_CHAIN_ID, EXPLORER_URL } from "@/lib/wagmi";
import { SearchBar } from "@/components/SearchBar";
import { saveRegistration } from "@/lib/api";

// ─────────────────────────────────────────────────────────────────────────────
// Registration phase machine
//   0 = idle
//   1 = commit tx pending / mining
//   2 = waiting out minCommitmentAge
//   3 = ready to register
//   4 = register tx pending / mining
//   5 = post-register configuration (resolver / addr / reverse)
//   6 = done
//
// We probe the registrar at runtime to figure out whether it supports the
// modern ENS commit-reveal flow (8-arg register + makeCommitment) or whether
// it's the simple 3-arg register variant. If commit-reveal is unavailable
// the flow collapses to phases 0 → 4 → 5 → 6.
// ─────────────────────────────────────────────────────────────────────────────
type RegPhase = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const DEFAULT_MIN_COMMITMENT_AGE = 60n; // seconds

/**
 * Pull the most useful piece of text out of a viem ContractFunctionExecutionError
 * (or wallet rejection / generic Error). Falls back to a short generic message.
 */
function extractRevertReason(err: unknown): string {
  if (!err) return "unknown error";
  // viem stacks reasons under .shortMessage / .cause.shortMessage / .details
  const anyErr = err as {
    shortMessage?: string;
    details?: string;
    message?: string;
    cause?: { shortMessage?: string; reason?: string; message?: string };
  };
  if (anyErr.cause?.shortMessage) return anyErr.cause.shortMessage;
  if (anyErr.cause?.reason) return anyErr.cause.reason;
  if (anyErr.shortMessage) return anyErr.shortMessage;
  if (anyErr.details) return anyErr.details;
  if (anyErr.message) {
    // viem messages are multi-line; first line is usually the headline
    return anyErr.message.split("\n")[0];
  }
  return "transaction reverted";
}

export default function DomainDetail() {
  const [, params] = useRoute("/domain/:name");
  const rawName = params?.name?.replace(/\.arc$/i, "").toLowerCase().trim() ?? "";
  const name = rawName;
  const fullName = `${name}.${TLD}`;
  const node = name ? getDomainNode(name) : ("0x0" as `0x${string}`);
  const tokenId = name ? tokenIdFromLabel(name) : 0n;

  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { open } = useWeb3Modal();
  const publicClient = usePublicClient();

  // ── UI state ────────────────────────────────────────────────────────────────
  const [years, setYears] = useState(1);
  const [phase, setPhase] = useState<RegPhase>(0);
  const [activeTab, setActiveTab] = useState<"overview" | "records" | "ownership">("overview");
  const [editingRecord, setEditingRecord] = useState<string | null>(null);
  const [recordValue, setRecordValue] = useState("");
  const [commitError, setCommitError] = useState<string | null>(null);
  const [postSetupMsg, setPostSetupMsg] = useState<string | null>(null);
  const [waitSecondsLeft, setWaitSecondsLeft] = useState(0);

  const [renewYears, setRenewYears] = useState(1);

  // ── Refs that must survive re-renders ───────────────────────────────────────
  const secretRef = useRef<`0x${string}` | null>(null);
  const useCommitRevealRef = useRef<boolean>(true);

  const durationSeconds = BigInt(getSecondsFromYears(years));
  const renewDurationSeconds = BigInt(getSecondsFromYears(renewYears));

  const isWrongNetwork = isConnected && chainId !== ARC_CHAIN_ID;

  // ─── Reads ────────────────────────────────────────────────────────────────
  const {
    data: registryOwner,
    isLoading: ownerLoading,
    refetch: refetchOwner,
  } = useReadContract({
    address: REGISTRY_ADDRESS,
    abi: REGISTRY_ABI,
    functionName: "owner",
    args: [node],
    query: { enabled: !!name },
  });

  // ── Derive BaseRegistrar address (ERC721) ─────────────────────────────────
  // The controller (REGISTRAR_ADDRESS) does NOT implement ownerOf/reclaim —
  // those live on the BaseRegistrar. If VITE_BASE_REGISTRAR_ADDRESS isn't set,
  // read `registry.owner(namehash("arc"))` which returns the BaseRegistrar.
  const { data: derivedBaseRegistrar } = useReadContract({
    address: REGISTRY_ADDRESS,
    abi: REGISTRY_ABI,
    functionName: "owner",
    args: [namehash(TLD)],
    query: { enabled: !BASE_REGISTRAR_ADDRESS },
  });
  const baseRegistrarAddress: Address | undefined =
    (BASE_REGISTRAR_ADDRESS || (derivedBaseRegistrar as Address | undefined)) ||
    undefined;

  // NFT ownership — second source of truth.
  const { data: nftOwner, refetch: refetchNftOwner } = useReadContract({
    address: baseRegistrarAddress,
    abi: BASE_REGISTRAR_ABI,
    functionName: "ownerOf",
    args: [tokenId],
    query: { enabled: !!name && !!baseRegistrarAddress, retry: false },
  });

  const {
    data: availableData,
    isLoading: checkingAvailability,
    isError: availableError,
    refetch: refetchAvailable,
  } = useReadContract({
    address: REGISTRAR_ADDRESS,
    abi: REGISTRAR_ABI,
    functionName: "available",
    args: [name],
    query: { enabled: !!name },
  });

  // Prefer modern `rentPrice`; fall back to legacy `getPrice`.
  const { data: rentPriceData } = useReadContract({
    address: REGISTRAR_ADDRESS,
    abi: REGISTRAR_ABI,
    functionName: "rentPrice",
    args: [name, durationSeconds],
    query: { enabled: !!name, retry: false },
  });
  const { data: getPriceData } = useReadContract({
    address: REGISTRAR_ADDRESS,
    abi: REGISTRAR_ABI,
    functionName: "getPrice",
    args: [name, durationSeconds],
    query: { enabled: !!name && !rentPriceData, retry: false },
  });

  const { data: rentRenewPriceData } = useReadContract({
    address: REGISTRAR_ADDRESS,
    abi: REGISTRAR_ABI,
    functionName: "rentPrice",
    args: [name, renewDurationSeconds],
    query: { enabled: !!name, retry: false },
  });
  const { data: getRenewPriceData } = useReadContract({
    address: REGISTRAR_ADDRESS,
    abi: REGISTRAR_ABI,
    functionName: "getPrice",
    args: [name, renewDurationSeconds],
    query: { enabled: !!name && !rentRenewPriceData, retry: false },
  });

  const { data: resolvedAddress } = useReadContract({
    address: RESOLVER_ADDRESS,
    abi: RESOLVER_ABI,
    functionName: "addr",
    args: [node],
    query: { enabled: !!name },
  });

  const { data: minCommitmentAge } = useReadContract({
    address: REGISTRAR_ADDRESS,
    abi: REGISTRAR_ABI,
    functionName: "minCommitmentAge",
    query: { retry: false },
  });

  // ─── Writes ───────────────────────────────────────────────────────────────
  const {
    writeContractAsync: writeCommit,
    data: commitTxHash,
    isPending: commitPending,
    reset: resetCommit,
  } = useWriteContract();

  const {
    isLoading: commitTxLoading,
    isSuccess: commitTxSuccess,
  } = useWaitForTransactionReceipt({ hash: commitTxHash });

  const {
    writeContractAsync: writeRegister,
    data: registerTxHash,
    isPending: registerPending,
    error: registerWriteError,
    reset: resetRegister,
  } = useWriteContract();

  const {
    isLoading: registerTxLoading,
    isSuccess: registerTxSuccess,
    isError: registerTxError,
  } = useWaitForTransactionReceipt({ hash: registerTxHash, confirmations: 2 });

  const {
    writeContractAsync: writeRenew,
    data: renewTxHash,
    isPending: renewPending,
    error: renewWriteError,
  } = useWriteContract();
  const { isLoading: renewTxLoading, isSuccess: renewTxSuccess } =
    useWaitForTransactionReceipt({ hash: renewTxHash });

  const { writeContractAsync: writeAny } = useWriteContract();

  // ─── Derived ──────────────────────────────────────────────────────────────
  const isStillLoading = checkingAvailability || ownerLoading;
  const registryOwnerStr = (registryOwner as string | undefined) ?? "";
  const nftOwnerStr = (nftOwner as string | undefined) ?? "";

  // Ownership = NFT owner OR registry owner — either is enough.
  const effectiveOwner =
    !isZeroAddress(nftOwnerStr) ? nftOwnerStr :
    !isZeroAddress(registryOwnerStr) ? registryOwnerStr : "";

  const ownerIsZero = isZeroAddress(effectiveOwner);
  const isAvailable =
    availableData === true || (!!availableError && ownerIsZero);
  const isOwner = !!address && sameAddress(effectiveOwner, address);

  const ownershipOutOfSync =
    !!address &&
    !isZeroAddress(nftOwnerStr) &&
    sameAddress(nftOwnerStr, address) &&
    !sameAddress(registryOwnerStr, address);

  const totalPrice = resolvePrice(
    name,
    years,
    (rentPriceData as { base: bigint; premium: bigint } | undefined) ??
      (getPriceData as bigint | undefined)
  );
  const renewTotalPrice = resolvePrice(
    name,
    renewYears,
    (rentRenewPriceData as { base: bigint; premium: bigint } | undefined) ??
      (getRenewPriceData as bigint | undefined)
  );
  // +1% buffer so a tiny on-chain rounding diff (price changes per-second)
  // doesn't revert. Most ENS controllers refund the excess anyway.
  const totalWithBuffer = totalPrice + totalPrice / 100n;
  const renewTotalWithBuffer = renewTotalPrice + renewTotalPrice / 100n;

  const isValid = isValidDomainName(name);
  const minAgeSeconds =
    (minCommitmentAge as bigint | undefined) ?? DEFAULT_MIN_COMMITMENT_AGE;

  // ─── Phase transitions ────────────────────────────────────────────────────

  // Commit tx mined → start countdown
  useEffect(() => {
    if (!commitTxSuccess || phase !== 1) return;
    setPhase(2);
    const total = Number(minAgeSeconds) + 5; // +5s safety margin
    setWaitSecondsLeft(total);
    const interval = setInterval(() => {
      setWaitSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(interval);
          setPhase(3);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commitTxSuccess]);

  // Register tx mined → kick off post-setup
  useEffect(() => {
    if (!registerTxSuccess || phase !== 4) return;
    if (address && registerTxHash) {
      saveRegistration({
        domainName: name,
        walletAddress: address,
        txHash: registerTxHash,
        durationYears: years,
        chainId: ARC_CHAIN_ID,
      }).catch(() => {});
    }
    refetchOwner();
    refetchNftOwner();
    refetchAvailable();
    setPhase(5);
    void runPostRegistrationSetup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerTxSuccess]);

  useEffect(() => {
    if (!renewTxSuccess) return;
    refetchOwner();
    refetchNftOwner();
    refetchAvailable();
  }, [renewTxSuccess, refetchOwner, refetchNftOwner, refetchAvailable]);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  /** Begin = commit if commit/reveal is supported, otherwise direct register */
  const handleBeginRegistration = async () => {
    if (!address || !publicClient) return;
    setCommitError(null);
    resetCommit();
    resetRegister();

    // Fresh secret per attempt
    secretRef.current = generateSecret();

    // Probe: does the controller expose `makeCommitment`?
    let commitment: `0x${string}` | null = null;
    try {
      commitment = (await publicClient.readContract({
        address: REGISTRAR_ADDRESS,
        abi: REGISTRAR_ABI,
        functionName: "makeCommitment",
        args: [
          name,
          address,
          durationSeconds,
          secretRef.current,
          RESOLVER_ADDRESS,
          [] as `0x${string}`[],
          true, // reverseRecord
          0,    // ownerControlledFuses
        ],
      })) as `0x${string}`;
      useCommitRevealRef.current = true;
    } catch {
      useCommitRevealRef.current = false;
    }

    // ── Path A: commit-reveal ────────────────────────────────────────────────
    if (useCommitRevealRef.current && commitment) {
      setPhase(1);
      try {
        await writeCommit({
          address: REGISTRAR_ADDRESS,
          abi: REGISTRAR_ABI,
          functionName: "commit",
          args: [commitment],
        });
      } catch (err: unknown) {
        const msg = (err as { shortMessage?: string; message?: string }).shortMessage
          ?? (err as Error).message ?? "";
        setCommitError(
          msg.includes("rejected") || msg.includes("denied")
            ? "Commit rejected in wallet"
            : `Commit failed: ${msg.slice(0, 140)}`
        );
        setPhase(0);
      }
      return;
    }

    // ── Path B: simple 3-arg register, no commit/reveal ──────────────────────
    setPhase(4);
    try {
      await writeRegister({
        address: REGISTRAR_ADDRESS,
        abi: REGISTRAR_ABI,
        functionName: "register",
        args: [name, address, durationSeconds],
        value: totalWithBuffer,
      });
    } catch (err: unknown) {
      const msg = (err as { shortMessage?: string; message?: string }).shortMessage
        ?? (err as Error).message ?? "";
      setCommitError(formatTxError(msg, totalWithBuffer));
      setPhase(0);
    }
  };

  /** Step 3 → 4 — broadcast the actual register tx with the modern 8-arg ABI */
  const handleCompleteRegistration = async () => {
    if (!address || !secretRef.current) return;
    setPhase(4);
    setCommitError(null);

    // Pre-bake a setAddr(node, owner) call to bundle into `data` so the
    // resolver is wired in the same tx. The controller will execute it.
    const setAddrData = encodeFunctionData({
      abi: RESOLVER_ABI,
      functionName: "setAddr",
      args: [node, address],
    });

    console.info("[arcns] register tx →", {
      name: fullName,
      years,
      quotedUSDC: formatUsdc(totalPrice, 6),
      sendingUSDC: formatUsdc(totalWithBuffer, 6),
      bufferPct: "1%",
      registrar: REGISTRAR_ADDRESS,
    });

    try {
      await writeRegister({
        address: REGISTRAR_ADDRESS,
        abi: REGISTRAR_ABI,
        functionName: "register",
        args: [
          name,
          address,
          durationSeconds,
          secretRef.current,
          RESOLVER_ADDRESS,
          [setAddrData],
          true, // reverseRecord — set primary name in same tx if supported
          0,    // ownerControlledFuses
        ],
        value: totalWithBuffer,
      });
    } catch (err: unknown) {
      const msg = (err as { shortMessage?: string; message?: string }).shortMessage
        ?? (err as Error).message ?? "";
      setCommitError(formatTxError(msg, totalWithBuffer));
      setPhase(3);
    }
  };

  /**
   * Post-registration ENS setup. Each step is idempotent — we read the
   * current chain state and skip steps that are already in place.
   *
   *   1. registry.setResolver(node, RESOLVER_ADDRESS)
   *   2. resolver.setAddr(node, owner)
   *   3. reverseRegistrar.setName(`${name}.arc`)
   *
   * Steps 1 + 2 are usually NOT needed when the modern 8-arg register was
   * used (the controller wires them) — the idempotency checks will skip.
   */
  const runPostRegistrationSetup = async () => {
    if (!address || !publicClient) {
      setPhase(6);
      return;
    }
    try {
      // 1. setResolver
      setPostSetupMsg("Checking resolver…");
      const currentResolver = (await publicClient.readContract({
        address: REGISTRY_ADDRESS,
        abi: REGISTRY_ABI,
        functionName: "resolver",
        args: [node],
      })) as Address;

      if (!sameAddress(currentResolver, RESOLVER_ADDRESS)) {
        setPostSetupMsg("Setting resolver…");
        await writeAny({
          address: REGISTRY_ADDRESS,
          abi: REGISTRY_ABI,
          functionName: "setResolver",
          args: [node, RESOLVER_ADDRESS],
        });
      }

      // 2. setAddr
      setPostSetupMsg("Checking forward record…");
      const currentAddr = (await publicClient.readContract({
        address: RESOLVER_ADDRESS,
        abi: RESOLVER_ABI,
        functionName: "addr",
        args: [node],
      })) as Address;

      if (!sameAddress(currentAddr, address)) {
        setPostSetupMsg("Setting forward record (addr)…");
        await writeAny({
          address: RESOLVER_ADDRESS,
          abi: RESOLVER_ABI,
          functionName: "setAddr",
          args: [node, address],
        });
      }

      // 3. setName (reverse / primary)
      setPostSetupMsg("Setting primary name (reverse record)…");
      try {
        await writeAny({
          address: REVERSE_REGISTRAR_ADDRESS,
          abi: REVERSE_REGISTRAR_ABI,
          functionName: "setName",
          args: [fullName],
        });
      } catch (e) {
        // Not fatal — user can set the primary name later from their wallet.
        console.warn("[ArcNS] setName failed (non-fatal):", e);
      }

      // Force-refresh ownership + resolver state after successful setup
      await Promise.allSettled([
        refetchOwner(),
        refetchNftOwner(),
        refetchAvailable(),
      ]);

      setPostSetupMsg(null);
      setPhase(6);

      toast.success("Domain synced successfully");
    } catch (err) {
      console.warn("[ArcNS] post-registration setup failed:", err);
      setPostSetupMsg(null);
      // Still mark done — the name is registered; user can re-run from records tab.
      setPhase(6);
    }
  };

  /**
   * Manual "sync ownership" — rewrites registry.owner(node) to match the
   * NFT owner via BaseRegistrar.reclaim(tokenId, owner). msg.sender must be
   * the current ERC721 owner.
   *
   * Key fix: call the **BaseRegistrar** (not the controller). They are
   * different contracts in a standard ENS stack; calling reclaim on the
   * controller silently reverts.
   *
   * We simulate first so we can surface the real revert reason BEFORE the
   * wallet pops up — this avoids burning gas on a tx that will fail.
   */
  const handleSyncOwnership = async () => {
    if (!address) {
      toast.error("Connect your wallet first.");
      return;
    }
    if (!publicClient) {
      toast.error("RPC not ready, try again in a moment.");
      return;
    }

    const reclaimTarget = baseRegistrarAddress;
    const userIsNftOwner =
      !!nftOwnerStr && sameAddress(nftOwnerStr, address);

    // ── Path A: standard ENS — user owns the NFT → BaseRegistrar.reclaim ──
    if (reclaimTarget && userIsNftOwner) {
      try {
        // Simulate to catch reverts up front with their real reason.
        await publicClient.simulateContract({
          address: reclaimTarget,
          abi: BASE_REGISTRAR_ABI,
          functionName: "reclaim",
          args: [tokenId, address],
          account: address,
        });
        await writeAny({
          address: reclaimTarget,
          abi: BASE_REGISTRAR_ABI,
          functionName: "reclaim",
          args: [tokenId, address],
        });
        toast.success("Ownership synced. Registry now points to your wallet.");
        refetchOwner();
        refetchNftOwner();
        return;
      } catch (err: unknown) {
        const reason = extractRevertReason(err);
        console.warn("[ArcNS] reclaim failed:", err);
        toast.error(`Sync failed via reclaim: ${reason}`);
        // fall through to legacy setOwner as a last resort
      }
    }

    // ── Path B: legacy controller — user is the registry owner directly ──
    try {
      await publicClient.simulateContract({
        address: REGISTRY_ADDRESS,
        abi: REGISTRY_ABI,
        functionName: "setOwner",
        args: [node, address],
        account: address,
      });
      await writeAny({
        address: REGISTRY_ADDRESS,
        abi: REGISTRY_ABI,
        functionName: "setOwner",
        args: [node, address],
      });
      toast.success("Ownership synced.");
      refetchOwner();
      refetchNftOwner();
    } catch (err: unknown) {
      const reason = extractRevertReason(err);
      console.error("[ArcNS] setOwner failed:", err);
      if (!userIsNftOwner && !sameAddress(registryOwnerStr, address)) {
        toast.error(
          "You don't own this name on-chain (neither the NFT nor the registry entry). Nothing to sync.",
        );
      } else {
        toast.error(`Sync failed: ${reason}`);
      }
    }
  };

  const handleRenew = async () => {
    if (!address) return;
    try {
      await writeRenew({
        address: REGISTRAR_ADDRESS,
        abi: REGISTRAR_ABI,
        functionName: "renew",
        args: [name, renewDurationSeconds],
        value: renewTotalWithBuffer,
      });
    } catch {
      /* surfaced via renewWriteError */
    }
  };

  const handleSetRecord = async (key: string) => {
    if (!recordValue.trim() || !isOwner) return;
    try {
      if (key === "addr") {
        await writeAny({
          address: RESOLVER_ADDRESS,
          abi: RESOLVER_ABI,
          functionName: "setAddr",
          args: [node, recordValue as `0x${string}`],
        });
      } else {
        await writeAny({
          address: RESOLVER_ADDRESS,
          abi: RESOLVER_ABI,
          functionName: "setText",
          args: [node, key, recordValue],
        });
      }
      setEditingRecord(null);
      setRecordValue("");
    } catch {
      /* non-critical */
    }
  };

  const handleReset = () => {
    setPhase(0);
    setCommitError(null);
    setWaitSecondsLeft(0);
    setPostSetupMsg(null);
    secretRef.current = null;
    resetCommit();
    resetRegister();
  };

  // ─── Invalid name guard ───────────────────────────────────────────────────
  if (!isValid) {
    return (
      <div className="min-h-screen pt-24 px-4 flex flex-col items-center justify-center">
        <p className="text-white/60 mb-4">
          Invalid domain name — must be 3–63 lowercase letters, numbers, or hyphens (no leading/trailing hyphens).
        </p>
        <SearchBar size="sm" />
      </div>
    );
  }

  // ─── UI helpers ───────────────────────────────────────────────────────────
  const statusBadge = () => {
    if (isStillLoading)
      return (
        <span className="px-2 py-0.5 rounded-full bg-white/10 text-white/40 text-xs flex items-center">
          Checking…
        </span>
      );
    if (isAvailable)
      return (
        <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
          Available
        </span>
      );
    return (
      <span className="px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium">
        Registered
      </span>
    );
  };

  const showRegPanel = !isStillLoading && isAvailable && !isOwner;
  const showRenewPanel = !isStillLoading && !isAvailable && isOwner;

  const WrongNetworkBanner = () =>
    isWrongNetwork ? (
      <div className="mb-4 flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-amber-500/8 border border-amber-500/20">
        <p className="text-amber-300 text-sm">
          ⚠ Wrong network — switch to Arc Testnet to register
        </p>
        <button
          onClick={() => switchChain({ chainId: ARC_CHAIN_ID })}
          className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-500/15 text-amber-300 text-xs font-medium hover:bg-amber-500/25 transition-colors"
        >
          Switch Network
        </button>
      </div>
    ) : null;

  const RegistrationButton = () => {
    if (!isConnected) {
      return (
        <button
          onClick={() => open()}
          className="w-full py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-colors"
        >
          Connect Wallet to Register
        </button>
      );
    }
    if (isWrongNetwork) {
      return (
        <button
          onClick={() => switchChain({ chainId: ARC_CHAIN_ID })}
          className="w-full py-3.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold transition-colors"
        >
          Switch to Arc Testnet
        </button>
      );
    }
    if (phase === 0) {
      return (
        <button
          onClick={handleBeginRegistration}
          className="w-full py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-colors"
        >
          Begin Registration
        </button>
      );
    }
    if (phase === 1) {
      return (
        <button disabled className="w-full py-3.5 rounded-xl bg-white/5 text-white/40 cursor-not-allowed text-sm">
          {commitPending
            ? "Confirm commit in wallet…"
            : commitTxLoading
            ? "Submitting commit tx…"
            : "Processing commit…"}
        </button>
      );
    }
    if (phase === 2) {
      return (
        <button disabled className="w-full py-3.5 rounded-xl bg-white/5 text-white/40 cursor-not-allowed text-sm">
          Waiting protocol delay… {waitSecondsLeft}s
        </button>
      );
    }
    if (phase === 3) {
      return (
        <button
          onClick={handleCompleteRegistration}
          className="w-full py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-colors"
        >
          Complete Registration
        </button>
      );
    }
    if (phase === 4) {
      return (
        <button disabled className="w-full py-3.5 rounded-xl bg-white/5 text-white/40 cursor-not-allowed text-sm">
          {registerPending
            ? "Confirm register in wallet…"
            : registerTxLoading
            ? "Submitting register tx…"
            : "Processing register…"}
        </button>
      );
    }
    if (phase === 5) {
      return (
        <button disabled className="w-full py-3.5 rounded-xl bg-white/5 text-white/40 cursor-not-allowed text-sm">
          {postSetupMsg ?? "Configuring resolver…"}
        </button>
      );
    }
    return null;
  };

  const errorMsg =
    commitError ??
    (registerWriteError
      ? ((registerWriteError as { shortMessage?: string }).shortMessage ?? registerWriteError.message)
      : null) ??
    (registerTxError ? "Register transaction failed on-chain" : null);

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen pt-20 sm:pt-24 pb-16 px-3 sm:px-4">
      <div className="max-w-3xl mx-auto">
        <div className="mb-5 sm:mb-8">
          <SearchBar size="sm" initialValue={name} />
        </div>

        <WrongNetworkBanner />

        <div className="rounded-xl sm:rounded-2xl bg-white/3 border border-white/10 overflow-hidden">
          {/* ── Header ── */}
          <div className="p-4 sm:p-6 border-b border-white/8">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl bg-linear-to-br from-indigo-500/20 to-purple-600/20 border border-indigo-500/20 flex items-center justify-center shrink-0">
                  <span className="text-xl sm:text-2xl font-black text-indigo-300 uppercase">
                    {name[0]}
                  </span>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-lg sm:text-2xl font-bold text-white break-all">
                      {name}
                      <span className="text-white/40">.{TLD}</span>
                    </h1>
                    {statusBadge()}
                  </div>
                  {!isZeroAddress(effectiveOwner) && (
                    <a
                      href={`${EXPLORER_URL}/address/${effectiveOwner}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs sm:text-sm text-white/40 hover:text-white/60 transition-colors mt-0.5 block"
                    >
                      Owner: {formatAddress(effectiveOwner)}
                    </a>
                  )}
                </div>
              </div>
              {isOwner && (
                <span className="px-2 sm:px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-medium shrink-0 whitespace-nowrap">
                  You own this
                </span>
              )}
            </div>

            {isOwner && ownershipOutOfSync && (
              <div className="mt-3 flex items-center justify-between gap-3 p-3 rounded-xl bg-amber-500/8 border border-amber-500/20">
                <p className="text-amber-300 text-xs">
                  Registry owner doesn't match your wallet. Sync to enable record edits.
                </p>
                <button
                  onClick={handleSyncOwnership}
                  className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-500/15 text-amber-300 text-xs font-medium hover:bg-amber-500/25"
                >
                  Sync ownership
                </button>
              </div>
            )}
          </div>

          {/* ── Registration panel ── */}
          {showRegPanel && (
            <div className="p-4 sm:p-6 border-b border-white/8">
              {phase === 6 ? (
                /* ── Success state ── */
                <div className="text-center py-6">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-3">
                    <svg className="w-7 h-7 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 className="text-white font-semibold text-base mb-1">
                    Registration complete! 🎉
                  </h3>
                  <p className="text-white/40 text-sm mb-1">
                    <span className="font-mono text-white/60">{fullName}</span> is now yours.
                  </p>
                  {registerTxHash && (
                    <a
                      href={`${EXPLORER_URL}/tx/${registerTxHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-indigo-400 text-xs mt-3 hover:text-indigo-300"
                    >
                      View transaction ↗
                    </a>
                  )}
                  <div className="mt-4">
                    <button
                      onClick={handleReset}
                      className="text-white/30 text-xs hover:text-white/50 transition-colors"
                    >
                      Register another name
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <h2 className="text-white font-semibold mb-4">Register this name</h2>

                  {/* Duration + price */}
                  <div className="flex flex-wrap items-center gap-2 mb-5">
                    <span className="text-white/60 text-sm">Duration:</span>
                    <div className="flex items-center gap-1 flex-wrap">
                      {[1, 2, 3, 5].map((y) => (
                        <button
                          key={y}
                          onClick={() => setYears(y)}
                          disabled={phase > 0}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                            years === y
                              ? "bg-indigo-600 text-white"
                              : "bg-white/5 text-white/60 hover:text-white hover:bg-white/10"
                          }`}
                        >
                          {y}yr
                        </button>
                      ))}
                    </div>
                    {totalPrice > 0n && (
                      <span className="ml-auto text-white font-semibold text-sm bg-white/5 px-3 py-1.5 rounded-lg">
                        {formatUsdc(totalPrice, 2)} USDC
                      </span>
                    )}
                  </div>

                  {/* Step progress bar */}
                  <div className="mb-5">
                    <div className="flex gap-1.5 mb-3">
                      {REGISTRATION_STEPS.map((s) => {
                        const currentStep =
                          phase === 0 ? 0 :
                          phase === 1 ? 1 :
                          phase === 2 ? 2 :
                          phase === 3 ? 2 :
                          phase === 4 ? 3 :
                          phase === 5 ? 4 : 4;
                        return (
                          <div
                            key={s.id}
                            className={`flex-1 h-1 rounded-full transition-colors ${
                              currentStep >= s.id ? "bg-indigo-500" : "bg-white/10"
                            }`}
                          />
                        );
                      })}
                    </div>
                    {REGISTRATION_STEPS.map((s) => {
                      const currentStep =
                        phase === 0 ? 0 :
                        phase === 1 ? 1 :
                        phase === 2 ? 2 :
                        phase === 3 ? 2 :
                        phase === 4 ? 3 :
                        phase === 5 ? 4 : 4;
                      const done = currentStep > s.id;
                      const active = currentStep === s.id;
                      return (
                        <div
                          key={s.id}
                          className={`flex items-start gap-3 py-2 text-sm transition-opacity ${
                            active || done ? "opacity-100" : "opacity-30"
                          }`}
                        >
                          <div
                            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
                              done
                                ? "bg-emerald-500 text-white"
                                : active
                                ? "bg-indigo-500 text-white"
                                : "bg-white/10 text-white/40"
                            }`}
                          >
                            {done ? "✓" : s.id}
                          </div>
                          <div>
                            <span className="text-white font-medium text-sm">
                              {s.label}
                            </span>
                            <p className="text-white/40 text-xs mt-0.5">{s.description}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Cost summary */}
                  {isConnected && !isWrongNetwork && (
                    <div className="mb-4 p-3 rounded-xl bg-indigo-500/8 border border-indigo-500/20 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-white/70">
                          Registration cost
                          <span className="text-white/30 text-xs ml-1">
                            ({rentPriceData || getPriceData ? "on-chain" : "ENS-style pricing"})
                          </span>
                        </span>
                        <span className="text-white font-bold">
                          {formatUsdc(totalPrice, 2)} USDC
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-white/40 text-xs mt-1.5">
                        <span>Max sent (+1 % buffer, refunded if unused)</span>
                        <span>{formatUsdc(totalWithBuffer, 2)} USDC</span>
                      </div>
                    </div>
                  )}

                  {/* Error banner */}
                  {errorMsg && (
                    <div className="mb-4 flex items-start gap-2 p-3 rounded-xl bg-red-500/8 border border-red-500/20">
                      <span className="text-red-400 text-xs leading-relaxed flex-1">
                        ⚠ {errorMsg}
                      </span>
                      <button
                        onClick={handleReset}
                        className="shrink-0 text-red-400/60 text-xs hover:text-red-400 transition-colors"
                      >
                        Reset
                      </button>
                    </div>
                  )}

                  <RegistrationButton />
                </>
              )}
            </div>
          )}

          {/* ── Renewal panel ── */}
          {showRenewPanel && (
            <div className="p-4 sm:p-6 border-b border-white/8">
              {renewTxSuccess ? (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/8 border border-emerald-500/20">
                  <svg className="w-5 h-5 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <div>
                    <p className="text-emerald-300 text-sm font-medium">Renewal successful!</p>
                    {renewTxHash && (
                      <a
                        href={`${EXPLORER_URL}/tx/${renewTxHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-emerald-400/60 text-xs hover:text-emerald-400 mt-0.5 inline-block"
                      >
                        View transaction ↗
                      </a>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-white font-semibold">Renew name</h2>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 mb-4">
                    <span className="text-white/60 text-sm">Extend by:</span>
                    <div className="flex gap-1">
                      {[1, 2, 3, 5].map((y) => (
                        <button
                          key={y}
                          onClick={() => setRenewYears(y)}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                            renewYears === y
                              ? "bg-indigo-600 text-white"
                              : "bg-white/5 text-white/60 hover:text-white hover:bg-white/10"
                          }`}
                        >
                          {y}yr
                        </button>
                      ))}
                    </div>
                    {renewTotalPrice > 0n && (
                      <span className="ml-auto text-white font-semibold text-sm bg-white/5 px-3 py-1.5 rounded-lg">
                        {formatUsdc(renewTotalPrice, 2)} USDC
                      </span>
                    )}
                  </div>

                  <div className="mb-4 p-3 rounded-xl bg-indigo-500/8 border border-indigo-500/20 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-white/70">Renewal cost</span>
                      <span className="text-white font-bold">
                        {formatUsdc(renewTotalPrice, 2)} USDC
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-white/40 text-xs mt-1.5">
                      <span>Max sent (+5 % buffer)</span>
                      <span>{formatUsdc(renewTotalWithBuffer, 2)} USDC</span>
                    </div>
                  </div>

                  {renewWriteError && (
                    <div className="mb-3 p-3 rounded-xl bg-red-500/8 border border-red-500/20 text-xs text-red-400">
                      {(renewWriteError as { shortMessage?: string }).shortMessage ?? renewWriteError.message}
                    </div>
                  )}

                  <button
                    onClick={handleRenew}
                    disabled={renewPending || renewTxLoading || !isConnected || isWrongNetwork}
                    className="w-full py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {renewPending
                      ? "Confirm in wallet…"
                      : renewTxLoading
                      ? "Confirming renewal…"
                      : `Renew for ${renewYears} year${renewYears > 1 ? "s" : ""}`}
                  </button>
                </>
              )}
            </div>
          )}

          {/* ── Tabs ── */}
          <div className="border-b border-white/8 overflow-x-auto">
            <div className="flex min-w-max sm:min-w-0">
              {(["overview", "records", "ownership"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 sm:flex-none px-4 sm:px-6 py-3 text-sm font-medium transition-colors capitalize whitespace-nowrap ${
                    activeTab === tab
                      ? "text-white border-b-2 border-indigo-500"
                      : "text-white/40 hover:text-white/70"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {/* ── Tab content ── */}
          <div className="p-4 sm:p-6">
            {activeTab === "overview" && (
              <div>
                {[
                  { label: "Full name", value: fullName },
                  { label: "Namehash", value: `${node.slice(0, 18)}…` },
                  {
                    label: "Resolved addr",
                    value:
                      resolvedAddress && !isZeroAddress(resolvedAddress as string)
                        ? formatAddress(resolvedAddress as string)
                        : "Not set",
                  },
                  { label: "Status", value: isAvailable ? "Available" : "Registered" },
                  { label: "TLD", value: `.${TLD}` },
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    className="flex justify-between items-center py-3 border-b border-white/5 last:border-0 gap-3"
                  >
                    <span className="text-white/40 text-sm shrink-0">{label}</span>
                    <span className="text-white/80 text-xs sm:text-sm font-mono text-right break-all">
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {activeTab === "records" && (
              <div>
                {isOwner ? (
                  <>
                    <p className="text-sm text-white/50 mb-4">
                      Set records stored on-chain and publicly visible.
                    </p>
                    {["addr", "email", "url", "twitter", "github", "description"].map((key) => (
                      <div key={key} className="py-3 border-b border-white/5 last:border-0">
                        {editingRecord === key ? (
                          <div className="space-y-2">
                            <span className="text-white/40 text-xs uppercase tracking-wider">{key}</span>
                            <input
                              value={recordValue}
                              onChange={(e) => setRecordValue(e.target.value)}
                              placeholder={`Enter ${key}`}
                              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-indigo-500/50 text-white text-sm focus:outline-none"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleSetRecord(key)}
                                className="flex-1 px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-500 font-medium"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => { setEditingRecord(null); setRecordValue(""); }}
                                className="flex-1 px-3 py-2 rounded-lg bg-white/5 text-white/60 text-sm hover:bg-white/10"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <span className="text-white/40 text-sm block">{key}</span>
                              <span className="text-white/30 text-xs italic">Not set</span>
                            </div>
                            <button
                              onClick={() => setEditingRecord(key)}
                              className="text-indigo-400 text-xs hover:text-indigo-300 shrink-0 px-2 py-1 rounded-lg hover:bg-indigo-500/10 transition-colors"
                            >
                              Edit
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-white/40 text-sm">
                      {isAvailable
                        ? "Register this name to set records."
                        : "Only the owner can edit records."}
                    </p>
                  </div>
                )}
              </div>
            )}

            {activeTab === "ownership" && (
              <div>
                {[
                  { label: "Owner (registry)", value: !isZeroAddress(registryOwnerStr) ? registryOwnerStr : "N/A" },
                  { label: "Owner (NFT)", value: !isZeroAddress(nftOwnerStr) ? nftOwnerStr : "N/A" },
                  { label: "Resolver", value: RESOLVER_ADDRESS as string },
                  { label: "Registry", value: REGISTRY_ADDRESS as string },
                  { label: "Registrar", value: REGISTRAR_ADDRESS as string },
                  { label: "Reverse Registrar", value: REVERSE_REGISTRAR_ADDRESS as string },
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    className="flex justify-between items-center py-3 border-b border-white/5 last:border-0 gap-3"
                  >
                    <span className="text-white/40 text-sm shrink-0">{label}</span>
                    {value.startsWith("0x") ? (
                      <a
                        href={`${EXPLORER_URL}/address/${value}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-400 text-xs sm:text-sm font-mono hover:text-indigo-300 transition-colors"
                      >
                        {formatAddress(value)}
                      </a>
                    ) : (
                      <span className="text-white/60 text-sm">{value}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── helpers ────────────────────────────────────────────────────────────────
function formatTxError(msg: string, expected: bigint): string {
  if (msg.includes("rejected") || msg.includes("denied"))
    return "Transaction rejected in wallet";
  if (msg.includes("insufficient"))
    return `Insufficient USDC balance — need ${formatUsdc(expected, 2)} USDC`;
  return `Registration failed: ${msg.slice(0, 140)}`;
}
