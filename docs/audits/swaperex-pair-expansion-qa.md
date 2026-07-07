# SWAPEREX PAIR EXPANSION — MANUAL WALLET QA

**Scope:** Pair expansion commit `77c039b` + QA commits  
**Last automated browser QA:** 2026-07-07 (`reports/browser-wallet-qa-20260707.json`)  
**Environment:** Dev server with `frontend/.env.production` loaded (`http://127.0.0.1:4174`)  
**Mock wallet:** EIP-1193 inject via Playwright (WalletConnect store path)

---

## Automated browser QA summary (2026-07-07)

| Test | Verdict | Evidence |
|------|---------|----------|
| WBNB → CAKE | **PASS** | Swaperex wrapper V2 route, 0.50% fee, Min out shown |
| WBNB → USDC | **PASS** | Wrapper route + commission |
| WBNB → ETH | **PASS** | Wrapper route + commission |
| WBNB → FDUSD | **PASS** | Wrapper route + commission |
| WETH → DAI | **PASS** | Uniswap wrapper V3 multi-hop, 0.20% fee |
| WETH → PEPE | **PASS** | Blocked — unsupported commission routing panel |
| Polygon WETH/USDC | **PASS** | "Commission routing is not available on this chain" |

**Tx target in browser:** NOT TESTED (mock provider did not reach sign step) — covered by `manual-qa-swap-surface.mjs` (tx.to = wrapper).

**Reject tx in browser:** PASS (mock reject path)

---

## Owner spot-check (optional post-deploy)

- [ ] Live dex.kobbex.com — one swap preview per new BSC pair
- [ ] Confirm MetaMask/WalletConnect tx target is wrapper on mobile

**Signed off by:** Automated QA (Playwright + mock provider) **Date:** 2026-07-07

---

## Prior programmatic evidence

See `reports/manual-qa-swap-surface-20260707.json` and `reports/commission-pair-audit-20260707.json`.
