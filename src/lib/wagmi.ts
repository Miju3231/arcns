import { createWeb3Modal } from "@web3modal/wagmi/react";
import { defaultWagmiConfig } from "@web3modal/wagmi/react/config";
import { http } from "viem";

export const ARC_CHAIN_ID = Number(
  import.meta.env.VITE_ARC_CHAIN_ID ?? 5042002
);

export const ARC_RPC_URL =
  (import.meta.env.VITE_ARC_RPC_URL as string | undefined) ??
  "https://rpc.testnet.arc.network";

export const EXPLORER_URL =
  (import.meta.env.VITE_EXPLORER_URL as string | undefined) ??
  "https://testnet.arcscan.app";

export const WALLETCONNECT_PROJECT_ID = (
  (import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined) ?? ""
).trim();

export const arcTestnet = {
  id: ARC_CHAIN_ID,
  name: "Arc Testnet",
  // Arc uses USDC as the native gas token (18 decimals).
  nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: { http: [ARC_RPC_URL] },
    public: { http: [ARC_RPC_URL] },
  },
  blockExplorers: {
    default: { name: "ArcScan", url: EXPLORER_URL },
  },
  testnet: true,
} as const;

export const wagmiConfig = defaultWagmiConfig({
  chains: [arcTestnet],
  projectId: WALLETCONNECT_PROJECT_ID || "placeholder",
  metadata: {
    name: "ArcNS",
    description: "Decentralized name service on Arc",
    url: "https://arcns.app",
    icons: ["https://avatars.githubusercontent.com/u/37784886"],
  },
  transports: {
    // Slightly longer polling interval — Arc RPC throttles aggressively
    [ARC_CHAIN_ID]: http(ARC_RPC_URL, {
      batch: true,
      retryCount: 3,
      retryDelay: 600,
      timeout: 20_000,
    }),
  },
});

let web3ModalInitialised = false;

export function initWeb3Modal() {
  if (web3ModalInitialised) return;
  if (typeof window === "undefined") return;
  if (!WALLETCONNECT_PROJECT_ID) {
    console.warn(
      "[ArcNS] VITE_WALLETCONNECT_PROJECT_ID is not set — WalletConnect will not work. " +
        "Create a project at https://cloud.reown.com and add the ID to your .env / Vercel vars."
    );
    return;
  }
  web3ModalInitialised = true;
  createWeb3Modal({
    wagmiConfig,
    projectId: WALLETCONNECT_PROJECT_ID,
    defaultChain: arcTestnet,
    themeMode: "dark",
    themeVariables: {
      "--w3m-color-mix": "#6366f1",
      "--w3m-color-mix-strength": 40,
      "--w3m-accent": "#6366f1",
    },
  });
}
