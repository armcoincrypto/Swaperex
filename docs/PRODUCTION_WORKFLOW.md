# Swaperex — Production-safe workflow

**Live production:** https://dex.kobbex.com  
**Repository:** `/root/Swaperex-p8-visual`  
**Production baseline (main):** track `d8f03f8` until a newer commit is explicitly promoted.

This document replaces informal “Pack A / B / C” release notes with clear production language and a repeatable sequence. Git history may still mention old pack names in commit messages; **do not use pack naming for new work**.

---

## Improvement categories (use these names)

| Category | Scope | Typical paths |
|----------|--------|----------------|
| **Deployment safety** | Dev deploy hardening, restore-from-prod, audit scripts | `scripts/deploy-dev-frontend.sh`, `scripts/dev-restore-from-prod.sh`, `scripts/audit/*` |
| **Wallet runtime stability** | AppKit init, connect guards, runtime metadata | `frontend/src/services/wallet/*`, `frontend/src/components/wallet/*`, `frontend/src/hooks/useWallet.ts` |
| **Institutional UI cleanup** | Layout, copy, spacing, SEO visibility — **no swap logic** | `frontend/src/App.tsx`, `frontend/src/index.css`, swap UI components (display-only) |

**Out of scope without dedicated review:** swap execution (`useSwap.ts`), quote/route/commission services, contracts, backend APIs.

---

## Workflow (A → H)

### A. Inspect

```bash
cd /root/Swaperex-p8-visual
git fetch origin
git status --short
git branch --show-current
curl -sS https://dex.kobbex.com/version.txt
curl -sS https://dev.dex.kobbex.com/version.txt   # if dev is in use
```

Confirm production commit before starting. Do not deploy to production from a dirty tree.

### B. Create feature branch

Branch from current production baseline (or `main` when aligned):

```bash
git checkout d8f03f8   # or: git checkout main && git pull --ff-only
git checkout -b feat/<short-description>
```

Use descriptive branch names (`feat/swap-trust-copy`, `fix/appkit-connect-guard`) — not `pack-*` or `qa/pack-*`.

**Legacy candidate branches** (historical only, do not extend):

- `qa/pack-a-b-c-ui`, `qa/pack-a-plus-b`, `qa/pack-b-plus-pack-c`, `feat/pack-c-institutional-swap-ui`

Treat these as read-only references until rebased onto a clean feature branch.

### C. Make minimal patch

One concern per branch. Match existing code style. Avoid mixing deployment, wallet, and UI changes in a single promotion.

### D. Build locally

```bash
cd frontend
npm ci
NODE_OPTIONS="--max-old-space-size=2048" npm run build
npm test    # when relevant
```

### E. Deploy to dev

Requires clean git tree and hardened deploy script:

```bash
cd /root/Swaperex-p8-visual
sudo REPO_DIR=/root/Swaperex-p8-visual bash scripts/deploy-dev-frontend.sh
```

Dry run (no build, no filesystem changes):

```bash
bash scripts/deploy-dev-frontend.sh --dry-run
```

### F. Verify dev

```bash
bash scripts/audit/verify-dev-live.sh
curl -sS https://dev.dex.kobbex.com/version.txt
```

Manual checks: page loads (no blank/blue crash), wallet connect/cancel, quote + preview, key routes (Send, Portfolio, Radar, Screener).

### G. Production candidate report

Before any production deploy, produce:

1. **Commit list** — `git log --oneline <prod-baseline>..HEAD`
2. **File diff** — `git diff --stat <prod-baseline>..HEAD`
3. **Risk class** — low / medium / high per category above
4. **Rollback path** — prior `/var/www/swaperex` backup or redeploy previous `main` commit via `scripts/prod-deploy.sh`
5. **Manual QA result** — signed checklist

**Do not deploy production until explicit approval.**

### H. Deploy production (approval only)

```bash
git fetch origin && git checkout main && git pull --ff-only origin main
./scripts/prod-deploy.sh
bash scripts/audit/deploy-match.sh
bash scripts/audit/verify-live.sh
```

---

## Emergency: restore dev from production

If dev shows a fatal runtime error or wrong artifact:

```bash
cd /root/Swaperex-p8-visual
git checkout production-cleanup/workflow-simplification   # or your deploy-safety branch
sudo bash scripts/dev-restore-from-prod.sh
```

This copies `/var/www/swaperex` → `/var/www/swaperex-dev`. **Production is not modified.**

---

## Rollback (dev deploy)

After a failed dev deploy, use the rollback line printed at the end of `deploy-dev-frontend.sh`, e.g.:

```bash
sudo rm -rf /var/www/swaperex-dev \
  && sudo mv /var/www/swaperex-dev-backup-<TIMESTAMP> /var/www/swaperex-dev \
  && sudo systemctl reload nginx
```

---

## Script reference

| Script | Purpose |
|--------|---------|
| `scripts/deploy-dev-frontend.sh` | Safe dev build + atomic promote + smoke |
| `scripts/dev-restore-from-prod.sh` | Reset dev vhost from production artifact |
| `scripts/audit/verify-dev-live.sh` | Dev HTTP/asset/version checks |
| `scripts/audit/verify-live.sh` | Production health + SPA checks |
| `scripts/audit/deploy-match.sh` | Compare local build hash to live prod assets |
| `scripts/prod-deploy.sh` | Production deploy (requires clean tree + main sync) |

Syntax-check deploy scripts after edits:

```bash
bash -n scripts/deploy-dev-frontend.sh
bash -n scripts/dev-restore-from-prod.sh
bash -n scripts/audit/verify-dev-live.sh
bash -n scripts/audit/verify-live.sh
bash -n scripts/audit/deploy-match.sh
```
