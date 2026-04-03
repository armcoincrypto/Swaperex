# Swaperex

**Swaperex** is a **non-custodial DEX aggregator frontend**: connect a wallet, compare executable quotes from configured liquidity sources, review details, approve when needed, and sign swaps locally. The live app is hosted as a static SPA behind nginx.

**Live:** [https://dex.kobbex.com](https://dex.kobbex.com)

## What this repository is

The primary product in this repo is the **React + TypeScript + Vite** application under `frontend/`. It talks to chains via **ethers v6** and **Reown AppKit / WalletConnect**, aggregates quotes in the browser, builds unsigned swap transactions using chain-specific builders, and never holds user keys.

Supporting pieces:

- **`backend-signals/`** — small backend/helpers for signals and explorer-proxy style calls (as wired in the project).
- **`scripts/`** — production deploy, audit, and helper scripts.

> **Note:** Older documentation that described a Telegram/Python custodial bot is **obsolete**. This README reflects the **current DEX frontend**.

## Main stack

| Layer | Technology |
|--------|------------|
| UI | React 18, TypeScript, Vite, Tailwind |
| Wallet | Reown AppKit, WalletConnect, ethers v6 |
| Hosting | Static build → nginx (`/var/www/swaperex`) |
| State | Zustand stores |

## Architecture (summary)

- **Wallet session** — user connects via AppKit; RPC + chain switching are wallet-driven.
- **Quotes** — client requests quotes from configured aggregators / routers (e.g. 1inch, Uniswap V3, PancakeSwap V3) and selects an executable quote for the trade size.
- **Preview & signing** — unsigned transactions are shown in a review modal; the user approves in the wallet. Approvals and swaps are separate steps when required.
- **History & activity** — local device history (Quick Repeat) plus explorer-backed activity where configured.

## What already works (production scope)

- Wallet connect and network handling  
- Quote aggregation and selection UX  
- Preview, approval, swap execution, pending/recovery flows  
- Explorer links and trust-first copy on swap surfaces  
- Activity / history visibility  
- Reproducible **production deploy** (build → rsync → nginx → verification scripts)

## Milestone status

| Milestone | Status |
|-----------|--------|
| **Surface glossary parity + project documentation alignment** | **Completed** — consistent route/provider, stale-quote, and trust copy across swap card, preview, history, activity; README aligned with the DEX frontend. |
| **Bundle baseline + lazy-load non-swap tabs** | **Next** — code-splitting and lighter initial load without changing swap safety. |

## Local development

From the repository root:

```bash
cd frontend
npm ci
npm run dev
```

## Build, typecheck, and tests

```bash
cd frontend
npm ci
npm run build    # tsc && vite build
npm test         # vitest run
npm run lint     # optional
```

## Production deploy (safe sequence)

Deploy expects a **clean git tree** and **HEAD not ahead of `origin/main`** (see `scripts/prod-deploy.sh`).

Typical flow:

1. Merge or push to **`main`** on the remote.
2. On the production host (or your deploy environment), from the repo root:

```bash
git fetch origin && git checkout main && git pull --ff-only origin main
./scripts/prod-deploy.sh
```

`prod-deploy.sh` runs `npm ci` + `npm run build` in `frontend/`, rsyncs `frontend/dist/` to **`/var/www/swaperex`**, reloads nginx, then runs:

```bash
./scripts/audit/deploy-match.sh
./scripts/audit/verify-live.sh
```

You can also run `deploy-match.sh` and `verify-live.sh` manually after a deploy for an extra check.

## Important constraints

- **Non-custodial** — private keys stay in the user’s wallet; Swaperex does not sign on behalf of users.
- **Quotes are short-lived** — refresh stale quotes before confirming in the wallet.
- **On-chain truth** — explorers and wallet balances are authoritative for final amounts.
- **Do not ship swap math / routing / tx-builder changes** without dedicated review and testing.

## License

MIT (unless otherwise noted in `LICENSE`).
