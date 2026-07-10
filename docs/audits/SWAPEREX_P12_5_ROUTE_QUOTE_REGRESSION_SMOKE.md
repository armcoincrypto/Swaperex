# SWAPEREX P12.5 — Route/Quote Regression Scheduled Smoke

**Date:** 2026-07-10  
**Production:** https://dex.kobbex.com · commit `eee0264`  
**Verdict:** `P12_5_ROUTE_QUOTE_REGRESSION_SMOKE_PASS`

---

## Executive verdict

Deterministic read-only smoke implemented and validated on live production. Required routes (ETH/WETH→USDT, BNB/WBNB→USDT) pass on-chain wrapper quotes and browser UI quotes. Two consecutive runs: **19/19 PASS**. **No production deployment required.**

---

## Baseline commit

| Field | Value |
|-------|-------|
| Git HEAD | `eee0264170875fd7c92bf5a92f4420603d526e3d` |
| Live `version.txt` | `eee0264` |
| Rollback floor | `75b2ce7` |

---

## Route selection source

Derived from:

- `scripts/audit/audit-commission-pairs.mjs` — `CANDIDATES` + `BLOCKED`
- `scripts/audit/manual-qa-swap-surface.mjs` — `SUPPORTED` set

Not invented — unsupported pairs excluded except explicit block test (WETH→PEPE).

---

## Test matrix

| ID | Route | Chain | Required | Layer |
|----|-------|-------|----------|-------|
| eth-usdt | ETH→USDT | 1 | Yes | onchain + browser UI |
| weth-usdt | WETH→USDT | 1 | Yes | onchain + browser UI |
| weth-usdc | WETH→USDC | 1 | No | onchain |
| eth-usdc | ETH→USDC | 1 | No | onchain |
| bnb-usdt | BNB→USDT | 56 | Yes | onchain |
| wbnb-usdt | WBNB→USDT | 56 | Yes | onchain |
| weth-pepe-block | WETH→PEPE | 1 | No | onchain (expect BLOCKED) |

Plus HTTP: `/`, `/trust`, `/about`, `/privacy`, `/disclaimer`, entry bundle.

---

## Assertions

Structural (no fixed quote amounts):

- `amountOut > 0` and finite
- Commission applied (`feeAmount > 0`)
- Provider/wrapper family present (`uniswap-v3-wrapper-v2` / `pancakeswap-v3-wrapper-v2`)
- Input amount unchanged
- No fatal JS / blank screen / TDZ
- No transaction or signature requested

---

## Implementation

| Artifact | Path |
|----------|------|
| Smoke script | `scripts/audit/p12-5-route-quote-regression-smoke.mjs` |
| JSON report | `reports/p12-5-route-quote-smoke.json` |
| Raw evidence | `docs/audits/raw/p12_5_route_quote/` |
| Systemd service | `ops/systemd/swaperex-route-quote-smoke.service.example` |
| Systemd timer | `ops/systemd/swaperex-route-quote-smoke.timer.example` |

Exit codes: `0` pass · `1` regression · `2` environment failure.

---

## Dry-run behavior

```bash
node scripts/audit/p12-5-route-quote-regression-smoke.mjs --dry-run
```

Prints route matrix and planned checks only — no network wallet interaction.

---

## Live read-only results (2026-07-10)

| Check | Result |
|-------|--------|
| HTTP routes + bundle | **PASS** |
| ETH→USDT onchain | **PASS** ~17.94 USDT · 90ms · wrapper v2 · 20 bps |
| WETH→USDT onchain | **PASS** ~17.94 USDT · 45ms |
| BNB/WBNB→USDT BSC | **PASS** · 50 bps |
| WETH→PEPE | **PASS** (BLOCKED as expected) |
| Browser ETH/WETH UI quotes | **PASS** |
| Repeat run | **PASS** 19/19 |

---

## Latency observations

On-chain quotes: 45–200ms typical. Browser UI quote ready: &lt;25ms after read-only connect (cached pipeline). Suitable for 6-hour scheduled cadence.

---

## Failure semantics

Required on-chain or HTTP failure → exit `1`, verdict `P12_5_ROUTE_QUOTE_REGRESSION_SMOKE_BLOCKED`. Playwright missing → exit `2`.

---

## Scheduling recommendation

Use systemd timer (example provided):

- Cadence: every **6 hours**
- `Persistent=true`, `RandomizedDelaySec=300`
- `flock` overlap protection in service unit
- Alert integration: consume exit code or `reports/p12-5-route-quote-smoke.json`

**Not installed** — documentation/templates only per operator policy.

---

## Files created/modified

**Created:** smoke script, systemd examples, this audit, raw JSON evidence.  
**Modified:** none (application source unchanged).

---

## Tests run

```text
npm --prefix frontend run build          PASS
bash scripts/audit/verify-wrappers.sh    PASS
node scripts/audit/audit-commission-pairs.mjs  PASS 126/0/0
.venv/bin/pytest                         PASS 119 skip 3
p12-5 smoke ×2                           PASS 19/19 each
```

---

## Known limitations

- Browser layer uses read-only address (no WalletConnect pairing)
- On-chain layer does not exercise full UI token picker for BSC routes
- Quote amounts vary with market; structural assertions only

---

## Deployment requirement

**None.** Scripts and docs only.

---

## Final verdict

`P12_5_ROUTE_QUOTE_REGRESSION_SMOKE_PASS`
