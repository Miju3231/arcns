// ─────────────────────────────────────────────────────────────────────────────
// ArcNS — Contract addresses & ABIs (Arc Testnet)
//
// This file targets a standard ENS-style stack:
//   • Registry            (ENSRegistry / ENSRegistryWithFallback)
//   • ETHRegistrarController (commit + reveal, payable)
//   • BaseRegistrar       (ERC721, tokenId = labelhash(label))
//   • PublicResolver      (addr / text / contenthash / multicall)
//   • ReverseRegistrar    (setName / node)
//
// IMPORTANT NOTES
// ─────────────────────────────────────────────────────────────────────────────
// 1. ABIs below cover BOTH the modern ENS 8-arg `register(...)` and the legacy
//    5-arg variant. The DomainDetail flow probes which one is deployed at
//    runtime and picks the correct call shape.
// 2. Arc Testnet uses USDC as the native gas token (18 decimals). Prices
//    returned by `rentPrice` / `getPrice` are therefore in 18-decimal USDC
//    wei. See `USDC_DECIMALS` in `ens-utils.ts`.
// 3. Token id used by the BaseRegistrar is `BigInt(labelhash(label))` — i.e.
//    the label part only, NOT the full namehash. This is the ENS convention.
// ─────────────────────────────────────────────────────────────────────────────

import { type Address, namehash, labelhash, keccak256, toBytes } from "viem";
export { namehash, labelhash };

export const REGISTRY_ADDRESS = (
  import.meta.env.VITE_REGISTRY_ADDRESS ??
  "0xD7644411C393D1BE031889A809886d55D1164Dac"
) as Address;

export const REGISTRAR_ADDRESS = (
  import.meta.env.VITE_REGISTRAR_ADDRESS ??
  "0x6Ce3d7195aDFF59e3C5DCb8077c2C5707AcBC31c"
) as Address;

// BaseRegistrar (ERC721) — DIFFERENT contract from the controller above.
//   • Controller  (REGISTRAR_ADDRESS) → register / commit / rentPrice / renew
//   • BaseRegistrar (this one)         → ownerOf / nameExpires / reclaim
//
// If unset, the app reads `registry.owner(namehash("arc"))` at runtime to
// derive it (the BaseRegistrar owns the TLD node in the ENS registry).
export const BASE_REGISTRAR_ADDRESS = (
  import.meta.env.VITE_BASE_REGISTRAR_ADDRESS ?? ""
) as Address | "";

export const RESOLVER_ADDRESS = (
  import.meta.env.VITE_RESOLVER_ADDRESS ??
  "0xB1e687E9fBe7Ae822302a9479987c1CD23B28C1A"
) as Address;

export const REVERSE_REGISTRAR_ADDRESS = (
  import.meta.env.VITE_REVERSE_REGISTRAR_ADDRESS ??
  import.meta.env.VITE_REVERSE_RESOLVER_ADDRESS ??
  "0x346494613367891A144F7e9336B0F712b887b47E"
) as Address;

// Kept for backwards compatibility with existing imports
export const REVERSE_RESOLVER_ADDRESS = REVERSE_REGISTRAR_ADDRESS;

// Optional ERC-20 USDC address — only used if registrar pulls USDC via
// transferFrom. Leave unset for native-payment controllers.
export const USDC_ADDRESS = (import.meta.env.VITE_USDC_ADDRESS ?? "") as
  | Address
  | "";

export const TLD = "arc";

// ─── Scan floor ──────────────────────────────────────────────────────────────
// Arc Testnet RPC caps `eth_getLogs` at ~10,000 blocks per call and will
// time out / OOM on whole-chain scans. Never start scanning earlier than the
// registry deployment block. Override via VITE_REGISTRY_DEPLOY_BLOCK in .env.
export const REGISTRY_DEPLOY_BLOCK: bigint = (() => {
  const raw = import.meta.env.VITE_REGISTRY_DEPLOY_BLOCK;
  if (!raw) return 0n;
  try {
    return BigInt(raw);
  } catch {
    return 0n;
  }
})();

// ─── ENSRegistry ─────────────────────────────────────────────────────────────
export const REGISTRY_ABI = [
  { name: "owner",        type: "function", stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "", type: "address" }] },
  { name: "resolver",     type: "function", stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "", type: "address" }] },
  { name: "ttl",          type: "function", stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "", type: "uint64" }] },
  { name: "recordExists", type: "function", stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }] },
  { name: "setOwner",     type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "node", type: "bytes32" }, { name: "owner", type: "address" }],
    outputs: [] },
  { name: "setResolver",  type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "node", type: "bytes32" }, { name: "resolver", type: "address" }],
    outputs: [] },
  { name: "setRecord",    type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "owner", type: "address" },
      { name: "resolver", type: "address" },
      { name: "ttl", type: "uint64" },
    ],
    outputs: [] },
  { name: "NewOwner",     type: "event",
    inputs: [
      { name: "node",  type: "bytes32", indexed: true },
      { name: "label", type: "bytes32", indexed: true },
      { name: "owner", type: "address" },
    ] },
] as const;

// ─── ETHRegistrarController ──────────────────────────────────────────────────
// Combined ABI covering both modern (8-arg) and legacy (5-arg) variants,
// plus a simple `register(name,owner,duration)` for the lightweight
// custom controller previously shipped. Viem picks the matching overload
// by argument count.
export const REGISTRAR_ABI = [
  // ── views ─────────────────────────────────────────────────────────────────
  { name: "available", type: "function", stateMutability: "view",
    inputs: [{ name: "name", type: "string" }],
    outputs: [{ name: "", type: "bool" }] },

  { name: "minCommitmentAge", type: "function", stateMutability: "view",
    inputs: [], outputs: [{ name: "", type: "uint256" }] },

  { name: "maxCommitmentAge", type: "function", stateMutability: "view",
    inputs: [], outputs: [{ name: "", type: "uint256" }] },

  // Legacy / simple price getter (returns single uint256)
  { name: "getPrice", type: "function", stateMutability: "view",
    inputs: [
      { name: "name", type: "string" },
      { name: "duration", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }] },

  // Modern ENS price oracle
  { name: "rentPrice", type: "function", stateMutability: "view",
    inputs: [
      { name: "name", type: "string" },
      { name: "duration", type: "uint256" },
    ],
    outputs: [{
      components: [
        { name: "base",    type: "uint256" },
        { name: "premium", type: "uint256" },
      ],
      name: "", type: "tuple",
    }] },

  // ── commit / reveal ───────────────────────────────────────────────────────
  // Modern makeCommitment (8 args)
  { name: "makeCommitment", type: "function", stateMutability: "pure",
    inputs: [
      { name: "name",                  type: "string"   },
      { name: "owner",                 type: "address"  },
      { name: "duration",              type: "uint256"  },
      { name: "secret",                type: "bytes32"  },
      { name: "resolver",              type: "address"  },
      { name: "data",                  type: "bytes[]"  },
      { name: "reverseRecord",         type: "bool"     },
      { name: "ownerControlledFuses",  type: "uint16"   },
    ],
    outputs: [{ name: "", type: "bytes32" }] },

  { name: "commit", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "commitment", type: "bytes32" }],
    outputs: [] },

  { name: "commitments", type: "function", stateMutability: "view",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [{ name: "", type: "uint256" }] },

  // ── register overloads ────────────────────────────────────────────────────
  // Simple (3-arg) — original ArcNS controller
  { name: "register", type: "function", stateMutability: "payable",
    inputs: [
      { name: "name",     type: "string"  },
      { name: "owner",    type: "address" },
      { name: "duration", type: "uint256" },
    ],
    outputs: [] },

  // Modern ENS (8-arg)
  { name: "register", type: "function", stateMutability: "payable",
    inputs: [
      { name: "name",                  type: "string"  },
      { name: "owner",                 type: "address" },
      { name: "duration",              type: "uint256" },
      { name: "secret",                type: "bytes32" },
      { name: "resolver",              type: "address" },
      { name: "data",                  type: "bytes[]" },
      { name: "reverseRecord",         type: "bool"    },
      { name: "ownerControlledFuses",  type: "uint16"  },
    ],
    outputs: [] },

  // ── renewals ──────────────────────────────────────────────────────────────
  { name: "renew", type: "function", stateMutability: "payable",
    inputs: [
      { name: "name",     type: "string"  },
      { name: "duration", type: "uint256" },
    ],
    outputs: [] },

  // ── events ────────────────────────────────────────────────────────────────
  { name: "NameRegistered", type: "event",
    inputs: [
      { name: "name",    type: "string"            },
      { name: "label",   type: "bytes32", indexed: true },
      { name: "owner",   type: "address", indexed: true },
      { name: "cost",    type: "uint256"           },
      { name: "expires", type: "uint256"           },
    ] },
] as const;

// ─── PublicResolver ──────────────────────────────────────────────────────────
export const RESOLVER_ABI = [
  // addr (ETH)
  { name: "addr", type: "function", stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "", type: "address" }] },
  { name: "setAddr", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "a",    type: "address" },
    ],
    outputs: [] },

  // addr (multicoin)
  { name: "setAddr", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "node",     type: "bytes32" },
      { name: "coinType", type: "uint256" },
      { name: "a",        type: "bytes"   },
    ],
    outputs: [] },

  // text
  { name: "text", type: "function", stateMutability: "view",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "key",  type: "string"  },
    ],
    outputs: [{ name: "", type: "string" }] },
  { name: "setText", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "node",  type: "bytes32" },
      { name: "key",   type: "string"  },
      { name: "value", type: "string"  },
    ],
    outputs: [] },

  // name (reverse)
  { name: "name", type: "function", stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "", type: "string" }] },
  { name: "setName", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "name", type: "string"  },
    ],
    outputs: [] },

  // contenthash
  { name: "contenthash", type: "function", stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "", type: "bytes" }] },
  { name: "setContenthash", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "hash", type: "bytes"   },
    ],
    outputs: [] },

  // multicall (used to batch resolver setup in one tx when supported)
  { name: "multicall", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "data", type: "bytes[]" }],
    outputs: [{ name: "results", type: "bytes[]" }] },
] as const;

// Backwards-compat alias — some pages still import RESOLVER_ABI as
// REVERSE_RESOLVER_ABI for the `setName(name)` view; we keep both exports.
export const REVERSE_RESOLVER_ABI = RESOLVER_ABI;

// ─── ReverseRegistrar ────────────────────────────────────────────────────────
export const REVERSE_REGISTRAR_ABI = [
  { name: "setName", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "name", type: "string" }],
    outputs: [{ name: "", type: "bytes32" }] },
  { name: "setNameForAddr", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "addr",     type: "address" },
      { name: "owner",    type: "address" },
      { name: "resolver", type: "address" },
      { name: "name",     type: "string"  },
    ],
    outputs: [{ name: "", type: "bytes32" }] },
  { name: "node", type: "function", stateMutability: "pure",
    inputs: [{ name: "addr", type: "address" }],
    outputs: [{ name: "", type: "bytes32" }] },
] as const;

// ─── BaseRegistrar (ERC721) ──────────────────────────────────────────────────
// tokenId = uint256(labelhash(label))
export const BASE_REGISTRAR_ABI = [
  { name: "ownerOf", type: "function", stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }] },
  { name: "balanceOf", type: "function", stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }] },
  { name: "tokenOfOwnerByIndex", type: "function", stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "index", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }] },
  { name: "nameExpires", type: "function", stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }] },
  // Lets the current NFT owner push registry.owner(node) back to themselves
  // (or any address). Standard ENS BaseRegistrar function used by app.ens.domains
  // for the "Sync to L1" / re-claim flow after a transfer or fresh mint.
  { name: "reclaim", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "id",    type: "uint256" },
      { name: "owner", type: "address" },
    ],
    outputs: [] },
  { name: "Transfer", type: "event",
    inputs: [
      { name: "from",    type: "address", indexed: true },
      { name: "to",      type: "address", indexed: true },
      { name: "tokenId", type: "uint256", indexed: true },
    ] },
] as const;

// ─── ERC-20 (USDC) ───────────────────────────────────────────────────────────
export const ERC20_ABI = [
  { name: "balanceOf", type: "function", stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }] },
  { name: "allowance", type: "function", stateMutability: "view",
    inputs: [
      { name: "owner",   type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }] },
  { name: "approve", type: "function", stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "value",   type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }] },
] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Namehash of `${label}.${TLD}` */
export function getDomainNode(name: string): `0x${string}` {
  return namehash(`${name}.${TLD}`);
}

/** ENS `addr.reverse` node for a given address */
export function reverseNode(address: string): `0x${string}` {
  const lower = address.toLowerCase().replace(/^0x/, "");
  return namehash(`${lower}.addr.reverse`);
}

/** keccak256 of an address (without 0x prefix) — used by ReverseRegistrar */
export function addrLabelhash(address: string): `0x${string}` {
  return keccak256(toBytes(address.toLowerCase().replace(/^0x/, "")));
}

/** ERC721 tokenId for a given label (string before the TLD) */
export function tokenIdFromLabel(label: string): bigint {
  return BigInt(labelhash(label));
}

export function getLabelHash(name: string): bigint {
  return BigInt(labelhash(name));
}

export function formatDomain(name: string): string {
  if (name.endsWith(`.${TLD}`)) return name;
  return `${name}.${TLD}`;
}

export function stripTld(name: string): string {
  if (name.endsWith(`.${TLD}`)) return name.slice(0, -(TLD.length + 1));
  return name;
}
