# SWAPEREX P12 — Safe Backlog Lock

**Date:** 2026-07-10  
**Locked after:** P11 final closeout (`P11_CLOSED_PRODUCTION_STABLE`)  
**Production baseline:** https://dex.kobbex.com · commit `eee0264`  
**Rollback floor:** `75b2ce7` (unchanged)

---

## 1. Scope lock

P12 is **validation and vendor hygiene only**. The following are **out of scope** for every P12 item:

- UI redesign
- New product features
- Swap logic changes
- Routing changes
- Contract / wrapper changes
- Quote math changes
- Commission catalog changes

Any proposal outside this scope requires a new phase charter and explicit operator approval — not P12.

---

## 2. Backlog items

### P12.1 — Optional human mobile WalletConnect QR scan

| Field | Value |
|-------|-------|
| **Priority** | Low (optional) |
| **Type** | Operator validation |
| **Goal** | Complete a real mobile WalletConnect pairing on production `eee0264` — scan QR, approve session, sign nothing required |
| **Why** | P11.2 validated modal/back regression headless; mobile pairing was not completed in agent |
| **Pass criteria** | QR scan → connected address in header → modal open/back/close → disconnect → no `w3m-connecting-view` crash |
| **Safe deploy?** | No code change — operator session only |
| **Owner** | Operator / QA |

---

### P12.2 — Monitor Reown/AppKit dependency updates

| Field | Value |
|-------|-------|
| **Priority** | Medium |
| **Type** | Dependency watch |
| **Goal** | Track `@reown/appkit`, `@reown/appkit-adapter-ethers`, and related `@walletconnect/*` releases for security patches and WC-only regression risk |
| **Why** | P11 fix sits at AppKit init + modal layer; vendor upgrades can reintroduce router/persistence edge cases |
| **Pass criteria** | Changelog reviewed; if upgraded, full gate suite + P11.2 smoke re-run before any prod deploy |
| **Safe deploy?** | Only after gates + wallet smoke — no drive-by upgrades |
| **Owner** | Release manager |

**Watch surfaces:**

- `frontend/package.json` / lockfile
- Reown release notes
- P10 SVG phosphor patch (`patchReownWuiIconPhosphorSize.ts`) compatibility on bump

---

### P12.3 — Classify vendor font preload behavior

| Field | Value |
|-------|-------|
| **Priority** | Low |
| **Type** | Documentation / classification |
| **Goal** | Document Reown `fonts.reown.com/KHTeka-Medium.woff2` preload-unused console warning — confirm it remains cosmetic and non-blocking |
| **Why** | Recurring warning in P11.1/P11.2 smoke; already classified external in P11 closeout |
| **Pass criteria** | One-page classification added to audit or ops notes; no user-visible impact; no app code change unless Reown documents a supported suppression |
| **Safe deploy?** | Docs-only preferred |
| **Owner** | QA / Release manager |

---

### P12.4 — Production runtime warning watch

| Field | Value |
|-------|-------|
| **Priority** | Medium |
| **Type** | Ongoing observation |
| **Goal** | Periodic check that production console stays free of **new** app-thrown errors (especially wallet modal, chunk load, TDZ) |
| **Why** | Maintain stability after P11; catch regressions before operators do |
| **Pass criteria** | Scheduled pass: no new uncaught app errors; known external/extension warnings unchanged; document any new signal |
| **Safe deploy?** | Read-only observation |
| **Owner** | QA |

**Known non-blocking baseline (do not escalate):**

- Extension `contentscript.js` / `ObjectMultiplex`
- WalletConnect pulse telemetry failures
- Reown font preload warnings
- Informational Reown/ethers cache messages

**Escalate immediately:**

- `w3m-connecting-view: No connector provided` (P11 regression)
- Blank screen / TDZ / failed chunk load on `/`
- Quote pipeline failures on audited ETH/WETH USDT pairs

---

### P12.5 — Route/quote regression scheduled smoke

| Field | Value |
|-------|-------|
| **Priority** | Medium |
| **Type** | Scheduled validation |
| **Goal** | Re-run production-safe regression smokes on a cadence (post-deploy or weekly) without changing application logic |
| **Why** | Protect swap/routing/commission invariants while wallet layer stabilizes |
| **Pass criteria** | All gates PASS: `audit-commission-pairs.mjs` (126/0/0), ETH/WETH→USDT, `verify-wrappers.sh`, `.venv/bin/pytest`; optional `p11-2-operator-wallet-smoke.mjs` on wallet-touch deploys |
| **Safe deploy?** | Scripts/audit only — no feature work |
| **Owner** | Release manager / CI operator |

**Suggested command bundle:**

```bash
npm --prefix frontend run build
bash scripts/audit/verify-wrappers.sh
node scripts/audit/audit-commission-pairs.mjs
.venv/bin/pytest
# On wallet-touch releases:
SWAPEREX_QA_URL=https://dex.kobbex.com node scripts/audit/p11-2-operator-wallet-smoke.mjs
```

---

## 3. Sequencing recommendation

| Order | Item | Rationale |
|-------|------|-----------|
| 1 | P12.5 | Protects core swap invariants immediately |
| 2 | P12.4 | Lightweight ongoing watch |
| 3 | P12.2 | Dependency drift is the main external risk to P11 |
| 4 | P12.3 | Docs closure for known vendor noise |
| 5 | P12.1 | Optional human confirmation when convenient |

No item blocks production operation at `eee0264`.

---

## 4. Explicit non-goals (P12)

The following are **not** queued in P12:

- Homepage or swap UI redesign
- New chains, tokens, or commission pairs
- Aggregator or routing algorithm changes
- Wrapper contract deployments or upgrades
- Wallet connector expansion (injected wallets, email/social login)
- Performance refactors unrelated to validation

---

## SWAPEREX_P12_BACKLOG_LOCK

```yaml
phase: P12
title: Safe Backlog Lock
locked_at: 2026-07-10
baseline_commit: eee0264
baseline_verdict: P11_CLOSED_PRODUCTION_STABLE
rollback_floor: 75b2ce7
scope: validation_and_vendor_hygiene_only
items:
  - id: P12.1
    title: Optional human mobile WalletConnect QR scan
    type: operator_validation
    required: false
  - id: P12.2
    title: Monitor Reown/AppKit dependency updates
    type: dependency_watch
    required: true_on_upgrade
  - id: P12.3
    title: Classify vendor font preload behavior
    type: documentation
    required: false
  - id: P12.4
    title: Production runtime warning watch
    type: observation
    required: true
  - id: P12.5
    title: Route/quote regression scheduled smoke
    type: scheduled_validation
    required: true
feature_work: false
redesign: false
swap_routing_contract_changes: false
```
