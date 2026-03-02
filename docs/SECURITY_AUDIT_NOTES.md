# Security Audit Notes — Swaperex Frontend

**Last updated:** 2026-03-02  
**Scope:** `frontend/` (Vite + React)

Run `npm audit` in `frontend/` to get current findings. This doc classifies typical advisories and recommends actions.

---

## Dev-only vs production

| Category | Affects | Notes |
|----------|---------|------|
| **Dev** | `npm run dev`, `npm run lint`, build-time tooling | Not in production bundle. Risk limited to developer machines. |
| **Prod** | Deployed JS at dex.kobbex.com | Included in bundle. Higher priority to fix. |

---

## Typical advisories (Vite 5 + React stack)

### esbuild (moderate)

- **CVE:** GHSA-67mh-4wv8-2f99
- **Scope:** Dev-time only (Vite dev server)
- **Impact:** esbuild's own dev server can be exploited; Vite does not use that code path.
- **Recommendation:** **Accept.** The advisory targets esbuild's dev server, not Vite's. Production build output is unaffected.
- **Optional upgrade path:** Vite 6.2+ bundles esbuild 0.25.0 which resolves the advisory. Upgrade only if you need it for compliance; test thoroughly.

### minimatch / ajv

- **Scope:** Dev-time only (typically via `serve`, `serve-handler`, `typescript-eslint`, or other tooling)
- **Impact:** ReDoS or prototype pollution in dev/lint tooling. Not present in production bundle.
- **Recommendation:** **Accept** if only in devDependencies. Run `npm audit` and check dependency tree.
- **Optional:** `npm audit fix` (without `--force`) for patch-level updates; avoid `--force` on main.

### Vite 7 upgrade

- **Node requirement:** Node.js 20.19+ or 22.12+ (Vite 7 drops Node 18)
- **Recommendation:** Do **not** upgrade to Vite 7 until:
  1. Server/CI use Node 20.19+ or 22.12+
  2. You run: `npm ci && npm run build && npm run lint` (and tests if any)
  3. Wallet/swap flows are verified in dev and production build

---

## Actions to take

1. **Run `npm audit`** in `frontend/` and paste output into this section (or a linked file).
2. **Do NOT run `npm audit fix --force`** on main — it can install incompatible versions.
3. Use branch `chore/npm-audit-safe` for non-breaking remediation:
   - `npm audit fix` (no `--force`) for safe patches
   - Manually upgrade only after compatibility checks
4. Document any accepted risks here with justification.

---

## Accepted risks (template)

| Advisory | Severity | Why accepted |
|----------|----------|--------------|
| esbuild (GHSA-67mh-4wv8-2f99) | moderate | Dev server only; production build unaffected |
| _add others after npm audit_ | | |

---

## Dependencies not to remove

- **@web3modal/ethers** — Used in `src/services/wallet/web3modal.ts`, `w3m.ts`; initialized in `main.tsx`. Required for WalletConnect flow.
