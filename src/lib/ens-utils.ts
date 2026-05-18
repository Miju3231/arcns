// ─────────────────────────────────────────────────────────────────────────────
// ArcNS — ENS-style utilities, pricing, and formatting
//
// Arc Testnet uses USDC as its native gas token (18 decimals). All "USDC"
// values surfaced to wagmi/viem (`value:` fields, `rentPrice` results) are
// 18-decimal `bigint`s.
//
// Pricing tiers (per YEAR), used as fallback when the on-chain price
// oracle returns 0 or is unavailable:
//
//     3-char name  →  50 USDC
//     4-char name  →  20 USDC
//     5+ char      →   5 USDC  (floor — short premium reservations may
//                                charge more on chain)
//
// These mirror the standard ENS controller's tiered pricing and replace the
// previous 640/160/5 schedule that was producing wildly wrong totals.
// ─────────────────────────────────────────────────────────────────────────────

import { formatUnits, parseUnits } from "viem";

// Arc Testnet native USDC — 18 decimals. (NOT 6 like Ethereum mainnet USDC.)
export const USDC_DECIMALS = 18;
const ONE_USDC = BigInt(10) ** BigInt(USDC_DECIMALS);

// ── Validation ───────────────────────────────────────────────────────────────
export function isValidDomainName(name: string): boolean {
  const stripped = name.replace(/\.arc$/i, "").trim();
  if (stripped.length < 3 || stripped.length > 63) return false;
  if (stripped.startsWith("-") || stripped.endsWith("-")) return false;
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(stripped);
}

// ── Address helpers ──────────────────────────────────────────────────────────
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export function formatAddress(address: string, chars = 4): string {
  if (!address || address.length < chars * 2 + 2) return address ?? "";
  return `${address.slice(0, chars + 2)}…${address.slice(-chars)}`;
}

export function isZeroAddress(address: string): boolean {
  return !address || address === ZERO_ADDRESS || address === "0x";
}

export function sameAddress(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}

// ── Time helpers ─────────────────────────────────────────────────────────────
export function getSecondsFromYears(years: number): number {
  return Math.max(1, years) * 365 * 24 * 60 * 60;
}

export function getYearsFromSeconds(seconds: number): number {
  return Math.round(seconds / (365 * 24 * 60 * 60));
}

export function formatExpiry(timestamp: number): string {
  if (!timestamp || timestamp <= 0) return "—";
  return new Date(timestamp * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ── Crypto ───────────────────────────────────────────────────────────────────
export function generateSecret(): `0x${string}` {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return `0x${Array.from(array)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}` as `0x${string}`;
}

// ── Registration step descriptors (UI display only) ──────────────────────────
export const REGISTRATION_STEPS = [
  {
    id: 1,
    label: "Commit",
    description: "Reserve the name with a cryptographic commitment",
  },
  {
    id: 2,
    label: "Wait",
    description: "Wait the protocol delay so commitments can't be front-run",
  },
  {
    id: 3,
    label: "Register",
    description: "Pay and mint the .arc name NFT to your wallet",
  },
  {
    id: 4,
    label: "Configure",
    description: "Wire up resolver, forward record, and reverse / primary name",
  },
] as const;

// ─── Pricing ─────────────────────────────────────────────────────────────────

/** Per-YEAR fallback price in 18-decimal USDC */
export function ensAnnualPriceUsdc(name: string): bigint {
  const len = name.replace(/\.arc$/i, "").trim().length;
  if (len <= 3) return BigInt(50) * ONE_USDC; // 3-char → 50 USDC/yr
  if (len === 4) return BigInt(20) * ONE_USDC; // 4-char → 20 USDC/yr
  return BigInt(5) * ONE_USDC; //                5+ char → 5  USDC/yr (floor)
}

/** Total price (per chosen years) in 18-decimal USDC */
export function ensPriceForYearsUsdc(name: string, years: number): bigint {
  return ensAnnualPriceUsdc(name) * BigInt(Math.max(1, years));
}

// Convenience alias matching the new naming in the plan
export const computePriceUSDC = ensPriceForYearsUsdc;

/**
 * Pick the right price to charge:
 *   • If the on-chain oracle returned > 0, trust it.
 *   • Otherwise fall back to the ENS-style tier table.
 *
 * Handles both:
 *   - legacy `getPrice` → `uint256`
 *   - modern `rentPrice` → `{ base, premium }` tuple
 */
export function resolvePrice(
  name: string,
  years: number,
  onchain: bigint | { base: bigint; premium: bigint } | undefined | null
): bigint {
  let chain = BigInt(0);
  if (typeof onchain === "bigint") {
    chain = onchain;
  } else if (onchain && typeof onchain === "object") {
    chain = (onchain.base ?? BigInt(0)) + (onchain.premium ?? BigInt(0));
  }
  if (chain > BigInt(0)) return chain;
  return ensPriceForYearsUsdc(name, years);
}

// ── Formatting ───────────────────────────────────────────────────────────────
export function formatUsdc(amount: bigint, fractionDigits = 2): string {
  if (amount <= BigInt(0)) return "0";
  const full = formatUnits(amount, USDC_DECIMALS);
  if (fractionDigits === 0) return full.split(".")[0];
  const [whole, frac = ""] = full.split(".");
  const padded = (frac + "0".repeat(fractionDigits)).slice(0, fractionDigits);
  return fractionDigits > 0 ? `${whole}.${padded}` : whole;
}

export function parseUsdc(value: string): bigint {
  if (!value || value.trim() === "") return BigInt(0);
  return parseUnits(value as `${number}`, USDC_DECIMALS);
}

// Alias matches plan naming
export const formatUSDC = formatUsdc;
export const parseUSDC = parseUsdc;
