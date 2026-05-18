# ArcNS — Blockchain Logic Fix Report (v2)

This patch addresses the registration-flow, ownership-detection, pricing,
ABI, and event-scanning issues. UI/styling is unchanged — only blockchain
logic was modified.

## Files changed
- `src/lib/contracts.ts` — full ENS-stack ABIs (rewritten)
- `src/lib/ens-utils.ts` — pricing tiers + USDC helpers (rewritten)
- `src/lib/wagmi.ts` — http transport hardening
- `src/lib/scan-logs.ts` — **new** safe chunked log scanner
- `src/pages/DomainDetail.tsx` — full registration flow rewrite
- `src/pages/MyDomains.tsx` — ERC721-enumeration first, log scan fallback
- `src/pages/Explore.tsx` — chunked log scan

## Fixes

### 1. Resolver / primary name not configured after mint
**Root cause**: the controller was being called with the simple 3-arg
`register(name, owner, duration)`, which mints the NFT but does NOT touch
the resolver, addr record, or reverse name. Nothing else ever ran.

**Fix**: `DomainDetail.tsx` now performs the full ENS flow:
1. `commit(makeCommitment(...))`
2. wait `minCommitmentAge` (read from chain, fallback 60s)
3. `register(name, owner, duration, secret, resolver, [setAddr(node, owner)], reverseRecord=true, fuses=0)`
   — bundles `setAddr` into the same tx via the controller's `data[]`.
4. **Post-setup batch** (each idempotent — skipped if already configured):
   - `registry.setResolver(node, RESOLVER_ADDRESS)` if not already set
   - `resolver.setAddr(node, owner)` if not already set
   - `reverseRegistrar.setName("<name>.arc")` (non-fatal — user can retry)

If the deployed controller turns out to be the simple 3-arg variant, the
flow auto-falls-back to a single `register` tx then runs the post-setup
batch separately. Detection is by reading `makeCommitment(...)` — if it
reverts, we know the modern flow isn't supported.

### 2. Ownership detection
- Reads from **both** sources of truth: `BaseRegistrar.ownerOf(tokenId)`
  (NFT) and `Registry.owner(node)`.
- `tokenId = BigInt(labelhash(label))` (ENS convention).
- When NFT owner ≠ registry owner, the UI surfaces a **"Sync ownership"**
  button that calls `registry.setOwner(node, addr)`.
- Eliminates the "minted but page still says Available" bug.

### 3. Pricing
- Per-year USDC tiers corrected to:
  - 3-char  → **50 USDC**
  - 4-char  → **20 USDC**
  - 5+ char → **5 USDC** (floor)
- Confirms `USDC_DECIMALS = 18` (Arc Testnet's native gas token is 18-decimal USDC, **not** 6).
- `resolvePrice(name, years, onchain)` accepts both:
  - legacy `getPrice → uint256`
  - modern `rentPrice → (base, premium)` tuple
  and falls back to the tier table when the oracle returns 0.
- Buffer reduced from 10 % → 5 % to avoid sending more than necessary.

### 4. ABIs
- New unified ABI in `contracts.ts` covers BaseRegistrar (ERC721 + nameExpires),
  PublicResolver (addr/text/name/setAddr/setText/setName/multicall),
  ReverseRegistrar (setName/setNameForAddr/node), and both register overloads
  (3-arg and 8-arg).
- ERC-20 ABI added in case the controller is migrated to USDC `transferFrom`
  payment later.

### 5. Event scanning
- New `src/lib/scan-logs.ts`: `scanLogsChunked()` slices block ranges into
  2k-block windows, retries each chunk with exponential backoff, and skips
  unreachable chunks instead of failing the entire scan.
- `Explore.tsx` and `MyDomains.tsx` now use it.
- `MyDomains` prefers `BaseRegistrar.balanceOf` + `tokenOfOwnerByIndex`
  (instant, no log scan). Log scan is fallback only.
- Hard cap on scan range — `MAX_SCAN_BLOCKS = 100_000n` for MyDomains and
  `SCAN_BLOCKS = 50_000n` for Explore.

### 6. Safer transitions
- `secretRef` is a `useRef`, regenerated per attempt (`crypto.getRandomValues`).
- Each phase has its own `useEffect` listening to a single boolean.
- All writes use `writeContractAsync` with try/catch — errors surface in UI.

## Files NOT touched (per request — UI preserved)
- All `src/components/**`
- `Header.tsx`, `Footer.tsx`, `DomainCard.tsx`, `SearchBar.tsx`
- `src/index.css`, `src/App.tsx`, `src/main.tsx`, `src/lib/api.ts`
- `src/pages/Home.tsx`, `src/pages/Reservations.tsx`, `src/pages/not-found.tsx`

## Drop-in instructions
Unzip into the project root, overwriting existing files. Add this optional
new env var if your reverse registrar address differs from the public
resolver address:

```
VITE_REVERSE_REGISTRAR_ADDRESS=0x346494613367891A144F7e9336B0F712b887b47E
```

## Open assumptions to verify against your deployed contracts
1. `ETHRegistrarController` exposes the modern 8-arg `register(...)` and
   `makeCommitment(...)`. Probing at runtime handles the simple variant too.
2. `BaseRegistrar` is an `ERC721Enumerable` — enables fast MyDomains. Falls
   back to log scan if not.
3. `rentPrice` (if exposed) returns 18-decimal USDC values. If your oracle
   returns 6-decimal values, change `USDC_DECIMALS` in `ens-utils.ts` to 6.

---

## Update — Arc Testnet 10k-block `eth_getLogs` cap

Arc Testnet RPC rejects any `eth_getLogs` window larger than ~10,000 blocks
(`-32602` / "block range too large"). The scanner has been hardened:

- **Default chunk lowered to 9,000** (`src/lib/scan-logs.ts`, `DEFAULT_CHUNK`).
- **Auto-halving**: on a range error the scanner halves the chunk down to a
  500-block floor and retries the same window — no failed scans from RPC
  hiccups or future cap changes.
- **Deploy-block floor**: `REGISTRY_DEPLOY_BLOCK` in `src/lib/contracts.ts`
  (set via `VITE_REGISTRY_DEPLOY_BLOCK`) prevents accidental `fromBlock: 0n`
  full-history scans.
- **Cursor cache**: `cacheKey` persists the highest scanned block per
  `(address, topic, user)` in `localStorage`, so repeat visits only walk the
  new tail instead of re-scanning the whole lookback window.
- **Early exit**: `Explore` stops scanning after 60 hits (renders 30).
- **User-scoped logs**: `MyDomains` still passes `args: { owner }` so the RPC
  filters on the indexed topic and returns minimal data per chunk.

### Action required

Add to `.env`:

```
VITE_REGISTRY_DEPLOY_BLOCK=<block number where your ENSRegistry was deployed>
```

If left unset, defaults to `0` and the page-level lookback windows
(`Explore` = 50k blocks, `MyDomains` = 100k blocks) still keep scans bounded.
