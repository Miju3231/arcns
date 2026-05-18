# ArcNS — .arc Name Service

Standalone Vite + React frontend for registering `.arc` names on the
Arc Testnet. Payments use Arc's native gas token (USDC, 18 decimals).

## Run locally

```bash
npm install
cp .env.example .env   # then fill VITE_WALLETCONNECT_PROJECT_ID
npm run dev
```

## Deploy on Vercel

1. Push this folder to a Git repo.
2. Import it in Vercel — framework auto-detected as Vite.
3. Set the env vars from `.env.example` (Project → Settings → Environment Variables).
   `VITE_WALLETCONNECT_PROJECT_ID` is **required**.
4. In [Reown / WalletConnect Cloud](https://cloud.reown.com), add your Vercel
   domain (e.g. `your-app.vercel.app`) to the project's allowed domains.
   This fixes the `Unsafe attempt to load URL https://secure.walletconnect.org/sdk`
   error — it only appears when the page is loaded from a domain that isn't
   whitelisted (including in-editor preview iframes).

## Pricing

Registration and renewal prices come from the on-chain `rentPrice` call.
If the contract returns 0 (e.g. unreleased registrar), the UI falls back to
ENS-style USD-denominated pricing converted to USDC at 1:1:

| Name length | Price / year |
| ---: | ---: |
| 3 chars  | 640 USDC |
| 4 chars  | 160 USDC |
| 5+ chars |   5 USDC |
