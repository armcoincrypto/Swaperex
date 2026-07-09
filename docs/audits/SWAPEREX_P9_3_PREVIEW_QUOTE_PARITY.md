# SWAPEREX P9.3 — Preview Quote Environment Parity

**Date:** 2026-07-09  
**Verdict:** `P9_3_FIXED_READY_FOR_OPERATOR_RETEST`  
**Commit (fix):** pending — `shouldPreferSameOriginRpcProxy` in `frontend/src/config/rpc.ts`

---

## 1. Problem statement

| Environment | ETH → USDT | Symptom |
|-------------|------------|---------|
| **Production** `https://dex.kobbex.com` | Works | Route via Uniswap V3 (Swaperex wrapper V2), quote ready, fee 0.20% |
| **Preview** `http://127.0.0.1:4175` (pre-fix) | Failed | “Live wrapper quote unavailable for this pair” (P9.2 audited-failure copy) |

Operator observation confirms **production routing is healthy** — not a wrapper/pair regression.

---

## 2. Root cause

**Preview-local environment / RPC proxy mismatch — not P9 homepage or route-copy regression.**

### Mechanism

1. Production builds set `import.meta.env.PROD = true` (`vite build` + `vite preview`).
2. `getEthereumReadRpcCandidates()` prepended **same-origin** `http://127.0.0.1:4175/rpc/eth` as the **first** RPC URL on any PROD host.
3. `vite preview` / `serve dist` serves static files only — **no nginx** `/rpc/*` → `backend-signals` proxy.
4. Wrapper V2 quotes (`uniswapWrapperQuoteV2.ts`) use `ETHEREUM_CONFIG.rpcUrl` (= primary candidate) **without** the multi-URL fallback loop used by balances.
5. JSON-RPC POST to `/rpc/eth` on preview returned **HTTP 404** → quote failed → UI showed audited “quote unavailable” panel.

### Endpoint comparison (measured)

| Endpoint | Preview `127.0.0.1:4175` | Production `dex.kobbex.com` |
|----------|---------------------------|----------------------------|
| `POST /rpc/eth` | **404** | **200** (`eth_chainId → 0x1`) |
| `GET /api/v1/health` | **404** | **200** (`status: ok`) |

`/api/v1/health` affects monitoring/status UI only — **not** wrapper quote path.

### Production nginx (expected)

`scripts/nginx/dex.kobbex.com.conf`:

```nginx
location /rpc/ {
  proxy_pass http://127.0.0.1:4001;  # backend-signals
}
```

Preview lacks this layer.

### Pair audit (unchanged)

```text
1 | ETH/USDT | ETH→USDT | PASS | uniswap-v3-wrapper-v2
1 | USDT/ETH | USDT→ETH | PASS | uniswap-v3-wrapper-v2
```

---

## 3. Fix applied (Option C — env/path handling only)

**File:** `frontend/src/config/rpc.ts`

Added `shouldPreferSameOriginRpcProxy()` — returns `false` on `localhost`, `127.0.0.1`, `[::1]`.

Production hostname (`dex.kobbex.com`, `dev.dex.kobbex.com` via nginx) **still prefers** same-origin `/rpc/eth|bsc`.

**Not changed:** quote math, wrapper contracts, swap execution, commission logic.

### Post-fix preview validation

| Check | Result |
|-------|--------|
| Preview `/rpc/eth` requests during load | **0** (was primary before) |
| Preview public RPC (`ethereum.publicnode.com`) | **8 requests** observed |
| “Live wrapper quote unavailable” on cold load | **Not shown** (wallet disconnected — expected) |

---

## 4. Option B — manual preview override (documented)

If preview ever needs explicit RPC override:

```bash
cd frontend
VITE_ETHEREUM_RPC_URL=https://ethereum.publicnode.com \
VITE_BSC_RPC_URL=https://bsc-dataseed.binance.org \
npm run build && npm run preview -- --host 127.0.0.1 --port 4176
```

No secrets required — public read endpoints only.

---

## 5. Validation gates

| Gate | Result |
|------|--------|
| `git diff --check` | PASS |
| `npm --prefix frontend run build` | PASS |
| `vitest rpc.test.ts` | PASS |
| `verify-wrappers.sh` | PASS |
| `audit-commission-pairs.mjs` | PASS 126 / 0 / 0 |
| `.venv/bin/pytest` | PASS 119 / skip 3 |

---

## 6. Is this a P9 code regression?

**No.** P9/P9.2 UI changes did not alter quote fetch paths. Failure was **prod-build RPC URL selection on localhost preview** — latent since P8A prod-build preview QA pattern.

---

## 7. Production deploy recommendation

**Yes — deploy may proceed** after operator live quote smoke on preview or post-deploy production:

1. Connect wallet on `dex.kobbex.com` (or fixed local preview).
2. ETH → USDT, amount `0.01`.
3. Confirm: Route via Uniswap V3 (Swaperex wrapper V2), quote ready.
4. **Do not approve/sign/swap** unless explicitly testing execution.

Confirm production still uses `/rpc/eth` (same-origin) — fix only skips proxy on localhost.

---

## 8. Rollback plan

| Scenario | Action |
|----------|--------|
| RPC regression on production | Revert P9.3 `rpc.ts` commit; redeploy `ff6460d` |
| Quote UI issue | Revert P9.2 copy commit; keep P9.3 if RPC fix validated |

---

## 9. Required operator validation

- [ ] Preview `127.0.0.1:4176` (post-fix build): connect wallet → ETH → USDT → quote ready
- [ ] Production `dex.kobbex.com`: unchanged quote smoke (no approve/sign)
- [ ] Verify `/rpc/eth` still used on production (DevTools network tab)

---

## 10. Final verdict

```text
P9_3_FIXED_READY_FOR_OPERATOR_RETEST
```

Preview quote failure was environment parity (missing nginx RPC proxy), not route support removal. Minimal RPC config fix restores preview quoting via public fallbacks while preserving production same-origin proxy behavior.
