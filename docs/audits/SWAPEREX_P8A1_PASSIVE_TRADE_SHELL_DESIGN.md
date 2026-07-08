# SWAPEREX P8A.1 — Passive / Trade Shell Design

**Date:** 2026-07-08  
**Mode:** Design only — **no implementation in this phase**  
**Main HEAD at design time:** `e97d752` (P8A.0 cycle fix committed, not deployed)  
**Production live:** `14cbf64` (P7C reverted; Trust Center + P5 live)  
**Prerequisites:** P7C RCA, P8A.0 wallet constants cycle break  
**Supersedes implementation ranking labels in** `SWAPEREX_P8A_PASSIVE_SHELL_SPLIT_PLAN.md` **for numbering:** this doc is the approved **P8A.1 design**; code lands in **P8A.2**.

---

## 1. Mission

Separate **passive** routes from **trade/wallet** routes so cold visits to Trust / legal / about do not pay for the eager wallet + swap entry graph — without reintroducing the P7C TDZ failure mode.

```text
Do NOT reapply direct lazy(SwapInterface).
Do NOT change useSwap / quotes / commission / wrappers / AppKit / autoReconnect internals.
Do NOT implement in this commit — design only.
```

---

## 2. Current shell graph

```text
App.tsx
  ├─ Route /admin/*  → LazyAdminApp (already separate)
  └─ Route /*        → DexMain
                        ├─ STATIC: SwapInterface, useWallet, NetworkSelector,
                        │          LazyWallet* loaders, stores, footer, SEO helpers
                        ├─ header always mounted (NetworkSelector eager)
                        ├─ useWallet() + autoReconnect on every DexMain mount
                        └─ currentPage switch:
                             swap → <SwapInterface />
                             send / portfolio / radar / screener → lazy tabs
                             about / terms / privacy / disclaimer / trust → lazy pages
```

### Important fact

Passive **page modules** (`TrustCenterPage`, `StaticPages`, `DexSiteFooter`) do **not** import `@/wallet`, `useWallet`, `SwapInterface`, or AppKit.

They still cost ethers + reconnect because they render **inside** `DexMain`, which always:

1. Statically imports `SwapInterface` and `useWallet`
2. Mounts `NetworkSelector` (also `useWallet`)
3. Runs the WalletBootstrap / storage-hint effects in the same tree

There is **no** dedicated `/learn` path today. “Learn” content is `LazyDexLearnMoreSection` below the fold on the **swap** tab only. Treat learn as **swap-adjacent SEO**, not a PassiveShell URL, unless a future `/learn` route is added.

### Route inventory (as implemented)

| URL / tab | Shell today | Needs wallet on entry? |
|-----------|-------------|------------------------|
| `/trust`, `/about`, `/terms`, `/privacy`, `/disclaimer` | DexMain | No |
| `/` (swap) | DexMain | Yes |
| send / portfolio (same `/` path, `currentPage`) | DexMain | Yes |
| radar / screener | DexMain | Soft / hybrid |
| `/admin/*` | Admin | Separate auth |
| `/learn` | **Not a route** | N/A |

---

## 3. Proposed shell graph

Smallest safe boundary: **route-level branch in `App.tsx`**, not an inner `currentPage` if/else that still shares DexMain’s static imports.

```text
App.tsx
  ├─ /admin/*     → Admin (unchanged LazyAdminApp)
  ├─ PassiveShell   → /trust /about /terms /privacy /disclaimer
  │                  (optional future: /learn if added as static SEO page)
  └─ TradeShell   → /* remaining (swap / send / portfolio / radar / screener)
                     = today’s DexMain rename/move, SwapInterface stays STATIC
```

Illustrative (not implementing now):

```tsx
<Routes>
  <Route path="/admin/*" element={<LazyAdminApp />} />
  <Route
    path="/trust"
    element={<PassiveShell><LazyTrustCenterPage /></PassiveShell>}
  />
  {/* likewise /about /terms /privacy /disclaimer */}
  <Route path="/*" element={<TradeShell />} />  {/* current DexMain */}
</Routes>
```

### Passive shell boundary

**In:**

- Presentational chrome only: logo, link-style nav to Trade (`/`), Resources links, existing footer patterns
- Lazy static page bodies already used today
- Client SEO (`applyClientRouteSeo`) for informational paths
- **Zero** imports of: `useWallet`, `NetworkSelector`, `SwapInterface`, `lazyWalletChunks`, `appKitActionsRegistry`, ethers

**Out:**

- Wallet connect UI, reconnect, chain banner, swap/intelligence panels

**CTA:** “Open swap” / navigate to `/` loads **TradeShell** as a full route change (acceptable). Reconnect then runs when TradeShell mounts — same as returning visitors who open `/` directly.

### Trade shell boundary

**In:**

- Current `DexMain` behavior wholesale (rename to `TradeShell` or move file)
- **Static** `import { SwapInterface } from '…'` inside TradeShell — **never** `lazy(() => import(SwapInterface))` at the App→Trade boundary
- Existing `useWallet`, NetworkSelector, WalletBootstrap gates, send/portfolio/radar/screener lazy tabs
- Existing P4.4 `shouldLoadHeaderWalletChunk` rules

**Out of P8A.2 scope:** changing AppKit init, autoReconnect implementation, quote/swap logic.

### Admin

Unchanged.

---

## 4. Why this avoids direct lazy `SwapInterface` (P7C risk)

| Failed P7C approach | This design |
|---------------------|-------------|
| `App` / `DexMain` remained wallet-heavy and only peeled `SwapInterface` into an async chunk | Passive routes **never mount** TradeShell, so they never touch SwapInterface or connectors init order from that peel |
| Lazy named export from entry altered Rollup order over a **latent** constants↔wallet cycle | P8A.0 already broke that cycle; still **do not** reintroduce naked lazy SwapInterface as the primary split |
| Passive pages still ran DexMain → ethers | PassiveShell has no `useWallet` static edge |

**Rule for implementers:**

```text
Code-split PassiveShell ↔ TradeShell at the Route level.
Keep SwapInterface a static import of TradeShell only.
Do not reapply bac05c0-style lazy SwapInterface from App/DexMain.
```

If a future phase wants a smaller TradeShell *entry*, that is a separate design after Playwright TDZ gates — not P8A.2.

---

## 5. Files likely to change later (P8A.2+)

| File | Likely change |
|------|----------------|
| `frontend/src/App.tsx` | Route branch; shrink default export to shell router |
| `frontend/src/components/shell/PassiveShell.tsx` | **New** — layout, no wallet imports |
| `frontend/src/components/shell/TradeShell.tsx` | **New** — move/rename current `DexMain` body (or keep DexMain as TradeShell alias) |
| Possibly thin shared `ShellChrome` presentational bits | Only if extractable with **zero** wallet deps (footer already safe) |

SEO / path helpers (`pathToPage`, `pageToPath`, `routeSeo`) may move to a shared module used by both shells — still no wallet imports.

---

## 6. Files explicitly not to change (P8A.2)

```text
useSwap / swap quote & execution paths
SwapInterface internals
commissionCoverage / wrappers / contracts / tokens / pairs
wallet/connectors.ts autoReconnect semantics
AppKit init / WalletBootstrap module behavior
admin API / backend
```

P8A.0 leaf import in `utils/constants.ts` already landed; do not revert it.

---

## 7. Duplicate work avoided

| Past work | Relationship |
|-----------|--------------|
| P7C lazy SwapInterface | **Do not duplicate** — known incident; replaced by shell-level split |
| P7B perf audit | Context only — ethers remains while DexMain is catch-all |
| Prior `SWAPEREX_P8A_PASSIVE_SHELL_SPLIT_PLAN.md` Option B | Same direction; this doc freezes the **design decision** and numbering |
| P8A.0 cycle fix | Prerequisite proven locally with P7C cherry-pick; keep on main |

---

## 8. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| WC user lands `/trust` then clicks Swap — session not restored | TradeShell mount must still call existing `useWallet` / storage-hint / bootstrap paths unchanged |
| Duplicate nav/footer drift | Share presentational components; no second design system |
| Accidental wallet import into PassiveShell | ESLint / grep gate in QA: PassiveShell tree must not resolve `useWallet` or `@/wallet` barrel except optionally `@/wallet/chains` types if ever needed (prefer none) |
| Bundle still preloads ethers on `/trust` | Success metric: cold `/trust` initial graph must **not** modulepreload `vendor-ethers` after P8A.2 |
| Large rewrite temptation | P8A.2 = route branch + move DexMain → TradeShell; no swap internals |

---

## 9. QA gate required before / during P8A.2 implementation

Mandatory before any production deploy of shell split:

1. `npm --prefix frontend run build`
2. Preview `dist`; Playwright `pageerror` capture on `/`, `/trust`, `/about` → `#root` children ≥ 1, **zero** TDZ
3. Network tab (or artifact check): cold `/trust` does **not** load `SwapInterface-*.js` or `vendor-ethers` (or document residual if any unexpected edge remains)
4. Reconnect matrix:
   - Fresh disconnected `/trust`
   - Fresh `/` connect + quote smoke (no commission changes)
   - WC / storage-hint user: `/trust` → navigate to `/` restores session
   - Injected / read-only paths unchanged
5. Wrapper + pair audits + pytest green
6. Confirm **no** `lazy(() => import(…SwapInterface))` in App/TradeShell

---

## 10. Rollback plan

```text
1. Revert the P8A.2 shell commit(s) only (App route branch + new shell files).
2. Static deploy prior artifact / git checkout of known-good frontend.
3. Do not “fix” by re-adding lazy SwapInterface.
4. Production can remain on pre-P8A.2 commit independently of P8A.0 deploy timing.
```

---

## 11. Recommendation

| Phase | Action |
|-------|--------|
| **P8A.1 (this doc)** | Design approved — stop here |
| **P8A.2** | Minimal PassiveShell route branch + TradeShell = today’s DexMain (static SwapInterface) |
| Later | Hybrid deferral for radar/screener if needed; never naked P7C |

**Deploy recommendation for this docs commit:** none (docs only).  
**Deploy of P8A.0 / P8A.2:** only with explicit approval after QA gates.

---

*End of P8A.1 design.*
