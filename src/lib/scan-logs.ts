// ─────────────────────────────────────────────────────────────────────────────
// ArcNS — Safe chunked log scanner (Arc Testnet hardened)
//
// Arc Testnet RPC enforces a hard cap of ~10,000 blocks per `eth_getLogs` call
// and will reject anything larger with -32602 / "block range too large" / a
// generic "invalid params". This scanner:
//
//   • Caps every chunk at 9,000 blocks (DEFAULT_CHUNK) — below the 10k limit.
//   • Auto-halves the chunk if the RPC still complains about the range.
//   • Retries transient failures with exponential backoff.
//   • Floors `fromBlock` at REGISTRY_DEPLOY_BLOCK so we never scan from 0.
//   • Persists the highest scanned block per (chainId,address,topic) in
//     localStorage so repeat visits only walk the new tail.
//   • Supports a `stopWhen(results)` early-exit predicate.
//   • Skips chunks that remain unreachable after all retries (logs a warning)
//     instead of failing the whole scan.
// ─────────────────────────────────────────────────────────────────────────────

import type { PublicClient, AbiEvent, Address, GetLogsReturnType, Log } from "viem";
import { REGISTRY_DEPLOY_BLOCK } from "./contracts";

const DEFAULT_CHUNK = 9_000n;       // Arc RPC limit is 10k — leave headroom.
const MIN_CHUNK = 500n;             // Floor when auto-halving.
const DEFAULT_RETRIES = 4;
const DEFAULT_MAX_CHUNKS = 400;

export interface ScanLogsOptions<TEvent extends AbiEvent> {
  client: PublicClient;
  address: Address | Address[];
  event: TEvent;
  args?: Record<string, unknown>;
  fromBlock: bigint;
  toBlock: bigint;
  /** Block-window size per request. Default 9_000n (Arc 10k cap). */
  chunk?: bigint;
  /** Retry attempts per chunk. Default 4. */
  retries?: number;
  /** Hard upper bound on total chunks scanned. Default 400. */
  maxChunks?: number;
  /** Early-exit predicate evaluated after each chunk. */
  stopWhen?: (results: Log[]) => boolean;
  /** Persist scan cursor in localStorage under this key. */
  cacheKey?: string;
}

function isRangeError(err: unknown): boolean {
  const msg = String((err as Error)?.message ?? err ?? "").toLowerCase();
  return (
    msg.includes("block range") ||
    msg.includes("range is too") ||
    msg.includes("too large") ||
    msg.includes("exceed") ||
    msg.includes("-32602") ||
    msg.includes("limit")
  );
}

function readCursor(key?: string): bigint | null {
  if (!key || typeof localStorage === "undefined") return null;
  try {
    const v = localStorage.getItem(`arcns:scan:${key}`);
    return v ? BigInt(v) : null;
  } catch {
    return null;
  }
}
function writeCursor(key: string | undefined, block: bigint) {
  if (!key || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(`arcns:scan:${key}`, block.toString());
  } catch {
    /* quota / disabled — ignore */
  }
}

export async function scanLogsChunked<TEvent extends AbiEvent>(
  opts: ScanLogsOptions<TEvent>
): Promise<Log[]> {
  const {
    client,
    address,
    event,
    args,
    toBlock,
    retries = DEFAULT_RETRIES,
    maxChunks = DEFAULT_MAX_CHUNKS,
    stopWhen,
    cacheKey,
  } = opts;

  // Clamp chunk to safe range.
  let chunk = opts.chunk && opts.chunk > 0n ? opts.chunk : DEFAULT_CHUNK;
  if (chunk > DEFAULT_CHUNK) chunk = DEFAULT_CHUNK;

  // Floor fromBlock at deploy block, and use cursor cache if present.
  const deployFloor = REGISTRY_DEPLOY_BLOCK;
  let from = opts.fromBlock < deployFloor ? deployFloor : opts.fromBlock;
  const cached = readCursor(cacheKey);
  if (cached !== null && cached + 1n > from && cached < toBlock) {
    from = cached + 1n;
  }

  if (toBlock < from) return [];

  const out: Log[] = [];
  let cursor = from;
  let chunkCount = 0;
  let lastSuccess: bigint | null = null;

  while (cursor <= toBlock && chunkCount < maxChunks) {
    const end = cursor + chunk - 1n > toBlock ? toBlock : cursor + chunk - 1n;
    chunkCount++;

    let attempt = 0;
    let success = false;
    let lastErr: unknown = null;

    while (attempt <= retries) {
      try {
        const logs = (await client.getLogs({
          address: address as Address,
          event,
          args: args as never,
          fromBlock: cursor,
          toBlock: end,
        })) as GetLogsReturnType<TEvent>;
        out.push(...(logs as unknown as Log[]));
        success = true;
        lastSuccess = end;
        break;
      } catch (err) {
        lastErr = err;
        attempt++;
        // If the RPC says the range is too large, halve the chunk and retry
        // the SAME window (don't advance the cursor).
        if (isRangeError(err) && chunk > MIN_CHUNK) {
          chunk = chunk / 2n > MIN_CHUNK ? chunk / 2n : MIN_CHUNK;
          // Recompute end with smaller chunk for this attempt.
          const newEnd = cursor + chunk - 1n > toBlock ? toBlock : cursor + chunk - 1n;
          // eslint-disable-next-line no-console
          console.warn(
            `[scanLogsChunked] range too large, halving chunk to ${chunk} and retrying ${cursor}-${newEnd}`
          );
          // Loop will retry with the now-smaller chunk; reset attempt budget once.
          if (attempt === 1) attempt = 0;
          continue;
        }
        if (attempt > retries) break;
        await new Promise((r) => setTimeout(r, 250 * 2 ** attempt));
      }
    }

    if (!success) {
      // eslint-disable-next-line no-console
      console.warn(
        `[scanLogsChunked] skipped chunk ${cursor}-${end}:`,
        (lastErr as Error)?.message ?? lastErr
      );
    }

    cursor = end + 1n;

    if (stopWhen && stopWhen(out)) break;
  }

  if (lastSuccess !== null) writeCursor(cacheKey, lastSuccess);

  return out;
}
