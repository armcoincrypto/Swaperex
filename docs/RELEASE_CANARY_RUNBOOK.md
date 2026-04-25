# Swaperex — Release gate: canary matrix & runbook

**Live:** https://dex.kobbex.com  
**Purpose:** Minimal pre-broad-rollout verification. Not a full QA matrix.

---

## 1. Executive summary

Before widening traffic, run **small notional** swaps on **Ethereum mainnet** covering: **direct Uniswap V3**, **Swaperex Uniswap wrapper** (ERC20→ERC20), **native ETH in** where supported, **ERC20 approval** (exact path if used), and **allowance-uncertainty** UX (refresh-only, no silent execute). Capture **browser console `[swap:obs]` JSON lines**, **tx hashes**, and **explorer** receipts. Abort broad rollout if any **stop-ship** condition fires or canary **pass/fail** gates fail.

---

## 2. Canary test matrix (pass / fail)

| ID | Scenario | Preconditions | Steps | Pass | Fail |
|----|-----------|-----------------|-------|------|------|
| C1 | Direct Uniswap V3 (ERC20→ERC20) | Mainnet, pair quoted as `uniswap-v3`, not wrapper-eligible or wrapper skipped | Quote → preview → swap (small size) | Explorer: `to` = SwapRouter; receipt success; UI success; price impact shows **Not estimated** or real % for stable-stable only | Wrong `to`, revert, stuck confirming, misleading impact |
| C2 | Wrapper path (ERC20→ERC20) | Pair eligible; quote shows **Uniswap V3 (Swaperex wrapper)**; fee BPS verified in UI | Quote → preview (note wrapper fee %) → swap | Explorer: `to` = configured wrapper contract; receipt success; **output** consistent with quoted net; no unexpected second ERC20 approval for native | Tx to router instead of wrapper, gross/net mismatch vs quote, approval loop |
| C3 | Native ETH → token | From asset native ETH; direct Uniswap path | Quote → preview → swap | `swap_tx_submit.value` > 0 in logs where applicable; **no** ERC20 approval step; receipt success | Approval prompt for ETH, `value` = 0 when native in, revert |
| C4 | ERC20 → native ETH (unwrap) | Pair with unwrap on direct router | Small swap through quoted path | Receipt success; balances move as expected | Revert, wrong unwrap |
| C5 | Approval required | ERC20 in, `needsApproval` true | Approve then swap | Two txs in order; allowance then swap succeeds | Swap sends without allowance, infinite spinner, wrong spender |
| C6 | Approval skipped (native in) | Native ETH in | Quote shows no approval; confirm swap | `[swap:obs]` includes `approval_skipped` with `reason: native_input` if approval path touched; single swap tx | ERC20 approval tx offered |
| C7 | Allowance uncertain | Simulate RPC flake if possible, or use documented refresh path | When UI shows allowance uncertain, attempt confirm | Execution **blocked** with refresh guidance; no swap tx until refresh clears uncertainty | Swap proceeds without confirmed allowance |
| C8 | Quote expiry | Wait >30s on preview | Try confirm after TTL | `quote_expired_block` in console; user prompted refresh; no broadcast | Stale quote executes |
| C9 | Treasury / wrapper fee | Wrapper swap (C2) | Compare quoted **wrapper protocol fee %** to on-chain `FEE_BPS` / explorer logs | UI fee matches chain read when verified; explorer event/value aligns with expectations | Env-only fee when chain read should succeed, silent fee drift |
| C10 | Observability | DevTools console open | Complete one quote + one full swap | See ordered events in §3 **required** for that path | Missing critical events, JSON parse errors, spam unrelated to swap |

---

## 3. Evidence checklist (capture per canary swap)

Save in ticket / incident doc / release notes:

- [ ] **Chain** + **wallet address** (truncated in external comms if needed)
- [ ] **Pair**, **notional** (small), **route mode** (best vs forced)
- [ ] **Provider** shown in UI (`uniswap-v3` | `uniswap-v3-wrapper` | `1inch` | …)
- [ ] **Screenshot or copy** of preview: min received, slippage, fee rows (wrapper fee + unverified note if any)
- [ ] **Full `[swap:obs]` lines** for the attempt (export console or copy block)
- [ ] **Tx hash(es)** + **explorer URL(s)** (Etherscan/BscScan as applicable)
- [ ] **Explorer checks:** `to`, `value`, status (success/fail), **gas used**, **token transfers** (net out matches expectation for wrapper)
- [ ] **Before/after** wallet balances for affected tokens (rough)
- [ ] **Pass/fail** for matrix row + **owner initials + timestamp**

### Required `[swap:obs]` events (by path)

**Any quoted swap (post-aggregation):**

- `agg_route` — chain, `bestProvider`, `runnerUp`, `lane`, truncated `reason`

**After wrapper gate (mainnet only, when gate runs):**

- Either final `quote_ready` with `provider: uniswap-v3-wrapper`, **or** `wrapper_skip` with `reason`

**When quote is accepted for preview:**

- `quote_ready` — `provider`, `inputNative`, `spender`, `needsApproval`, `allowanceUncertain`, `quoteTs`, `quoteTtlMs`

**Confirm without expiry:**

- `confirm_swap` — `quoteAgeMs`, `provider`, `chainId`

**If quote too old:**

- `quote_expired_block` — must appear; user must not get a broadcast from stale quote

**Execution:**

- `swap_exec_start` — `approvalRequired`, `allowanceUncertain`, `inputNative`
- If ERC20 approval: `approval_tx_submit` → `approval_tx_confirmed` **or** native skip: `approval_skipped`
- `swap_tx_submit` — `to`, `value`, `dataLen`, `inputNative`, `approvalPath`
- `swap_tx_broadcast` — `hash`
- Success: `swap_tx_confirmed` with `status: 1` and `gasUsed`  
- On-chain failure: `swap_tx_failed`

**Session recovery (if tested):**

- `pending_reconciled` / `recovery_tx_confirmed` / `recovery_tx_failed` / `recovery_tx_uncertain` as applicable

---

## 4. Stop-ship criteria (do not broaden rollout)

Ship **blocked** if any occur during canary on **dex.kobbex.com** (or release candidate):

1. **Wrong execution target:** swap `to` does not match expected router or wrapper for the quoted provider.
2. **Silent allowance risk:** swap broadcasts while `allowanceUncertain` was true or UI said refresh required.
3. **Native ETH mis-billed:** native input still triggers ERC20 approval flow, or `value` is wrong vs quoted native path.
4. **Wrapper fee dishonesty:** verified on-chain fee BPS disagrees with displayed fee with no “unverified” fallback when RPC succeeded.
5. **Misleading safety:** price impact shown as negligible when sentinel / not estimated path should show **Not estimated** (regression).
6. **Observability blackout:** no `quote_ready` + `swap_tx_submit` + `swap_tx_broadcast` for a completed swap (cannot debug production).
7. **Material revert rate:** >1 unexplained revert on canary-sized trades after RPC/wallet sanity checks.
8. **Custody / funds:** any user report of stuck funds traceable to new swap logic without mitigation.

---

## 5. Rollback steps

1. **Revert frontend deploy** to last known-good artifact (CDN/hosting rollback per your pipeline).
2. **Tag** the bad release in git; **re-deploy** previous SHA.
3. **Communicate** “swap on Swaperex — use previous build” if users were directed to a broken version.
4. **Preserve** canary evidence (console + explorer) for postmortem.
5. **Optional:** feature-flag off wrapper path only if architecture supports it without code revert; prefer full revert if unsure.

---

## 6. Broad-rollout criteria (all must be true)

- [ ] Matrix **C1–C4** (path coverage relevant to your launch scope) **pass** on production (or RC with prod-identical config).
- [ ] **C5–C8** pass if those flows are in scope for launch week.
- [ ] **C9** passes for every wrapper canary (fee integrity).
- [ ] **C10** passes; `[swap:obs]` corpus archived for the release.
- [ ] **Zero** stop-ship triggers in canary window.
- [ ] **Error budgets:** no spike in swap errors vs prior 24–48h baseline (monitoring / support — however you track).
- [ ] **On-call** aware of runbook location (`docs/RELEASE_CANARY_RUNBOOK.md`) and rollback command/owner.
- [ ] **Config sanity:** wrapper address + RPC + 1inch key (if used) documented for this release SHA.

---

*Document version: aligned with post-hardening swap stack (Uniswap direct + wrapper, allowance uncertainty, price impact honesty, `[swap:obs]`).*
