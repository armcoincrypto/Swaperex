# Swaperex DevOps + Fullstack Audit Report

**Date**: 2026-02-15
**Auditor**: Claude (automated codebase + config audit)
**Scope**: Repo at `/root/Swaperex`, server at `207.180.212.142` (Ubuntu 24.04, nginx, PM2)

> **NOTE**: This audit was performed from a CI container — system-level commands (nginx, pm2, ss, etc.) need to be run on the actual VPS. Server-side commands are provided as copy-paste ready blocks.

---

## A) Inventory Report

### A1. Repository Structure

| Component | Path | Size | Purpose |
|-----------|------|------|---------|
| **Frontend** | `frontend/` | 271 MB (263 MB node_modules) | React/Vite SPA, port 3000 |
| **Backend-Signals** | `backend-signals/` | 66 MB (66 MB node_modules) | Fastify signals proxy, port 4001 |
| **Python Backend** | `src/swaperex/` | 905 KB | FastAPI + Telegram bot, port 8000 |
| **Old Backend** | `backend/` | 121 KB (no node_modules) | **DEAD** — old signals server |
| **Tests (Python)** | `tests/` | 64 KB | 6 pytest files |
| **Scripts** | `scripts/` | 38 KB | Deploy, smoke-test, migration scripts |
| **Docs** | `docs/` | 109 KB | 18 markdown files (product spec + tech) |
| **Build output** | `frontend/dist/` | 5.9 MB | Vite production build |
| **Build output** | `backend-signals/dist/` | 76 KB | Compiled TypeScript |

### A2. What PM2 Manages (per `ecosystem.config.cjs`)

| App Name | Working Dir | Script | Port | Status |
|----------|------------|--------|------|--------|
| `frontend` | `/root/Swaperex/frontend` | `serve -s dist -l tcp://0.0.0.0:3000` | 3000 | **Should be STOPPED** (nginx serves static now) |
| `backend-signals` | `/root/Swaperex/backend-signals` | `dist/index.js` | 4001 | **RUNNING** |

### A3. What Nginx Serves (based on user-provided context)

| Site Config | Listens | Serves |
|-------------|---------|--------|
| `/etc/nginx/sites-enabled/swaperex` | 80 | Static files from `/var/www/swaperex` |
| `/etc/nginx/conf.d/bots.armcoincrypto.am.conf` | 80/443? | **Likely disabled/stale** |

### A4. Docker Compose Services (not running on VPS — used for Python backend)

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| `api` | `Dockerfile` | 8000 | FastAPI endpoints |
| `bot` | `Dockerfile` | — | Telegram bot (aiogram polling) |
| `scanner-btc` | `Dockerfile` | — | BTC deposit scanner |
| `scanner-eth` | `Dockerfile` | — | ETH deposit scanner |
| `scanner-trx` | `Dockerfile` | — | TRX deposit scanner |

### A5. CI/CD

| System | File | Triggers |
|--------|------|----------|
| GitHub Actions | `.github/workflows/ci.yml` | push to `main`, `claude/*`; PRs to `main` |
| VPS Auto-Update | `scripts/vps-auto-update.sh` | Cron (every 5 min) or webhook |
| Webhook Server | `scripts/webhook-server.js` | GitHub push events on port 9000 |

### A6. Remote Git Branches (17 total)

```
origin/main                                          ← production
origin/claude/explore-codebase-tbXec                 ← current
origin/claude/add-event-tracking-pqwee               ← stale
origin/claude/audit-improve-codebase-01L3dY2oJheDqdYZfkCW4oFp  ← stale
origin/claude/code-review-audit-MbWJa                ← stale
origin/claude/continue-session-01Cm8SZKGez5j4zTWbd7BG8H         ← stale
origin/claude/custom-token-import-MbWJa              ← stale
origin/claude/improve-user-retention-b3SGi           ← stale
origin/claude/repo-review-audit-01WYhK3d7NwV4c51UWhab5id        ← stale
origin/claude/telegram-crypto-wallet-01BdjQ4qiU3gKtWbPtepDkLZ   ← stale
origin/claude/ux-fixes-MbWJa                         ← stale
origin/claude/week1-error-messages-MbWJa             ← stale
origin/claude/week1-quote-expiry-MbWJa               ← stale
origin/claude/week2-safety-signals-MbWJa             ← stale
origin/claude/week3-portfolio-history-MbWJa          ← stale
origin/claude/week3-trending-pairs-MbWJa             ← stale
origin/claude/week5-presets-MbWJa                    ← stale
```

---

## B) Dead / Junk Candidates

### B1. DEAD CODE & FILES

| Item | Location | Severity | Reason |
|------|----------|----------|--------|
| **`backend/` directory** | `/root/Swaperex/backend/` | **HIGH** | Fully superseded by `backend-signals/`. Different architecture (ioredis vs in-memory). No `node_modules` installed. Lock file exists (1808 lines). **Should be deleted.** |
| **`react-router-dom` dependency** | `frontend/package.json` | MEDIUM | Installed (adds to bundle size) but **zero imports** in any `.ts`/`.tsx` file. State-based navigation via `currentPage` in App.tsx. |
| **`serve` dependency** | `frontend/package.json` | LOW | Listed as a runtime dependency — only needed by PM2 `frontend` app, which should now be stopped (nginx serves static). Still useful for local preview via `npm run preview`. |

### B2. HARDCODED PRODUCTION IP (207.180.212.142)

Found in **13 locations** — all fallback URLs for `VITE_SIGNALS_API_URL`:

| File | Line | Pattern |
|------|------|---------|
| `frontend/.env.production` | 1 | Direct assignment |
| `frontend/src/utils/constants.ts` | 98 | `import.meta.env.VITE_SIGNALS_API_URL \|\| 'http://207...'` |
| `frontend/src/hooks/useSignals.ts` | 52 | Same pattern |
| `frontend/src/hooks/useTxHistory.ts` | 35 | Same pattern |
| `frontend/src/stores/systemStatusStore.ts` | 13 | Same pattern |
| `frontend/src/stores/balanceStore.ts` | 15 | Same pattern |
| `frontend/src/services/transactionHistory.ts` | 12 | Same pattern |
| `frontend/src/services/signalsHealth.ts` | 10 | Same pattern |
| `frontend/src/services/evmBalanceService.ts` | 36 | Same pattern |
| `frontend/src/services/screener/coingeckoService.ts` | 15 | Same pattern |
| `frontend/src/services/walletScan/rpcConfig.ts` | 18 | Same pattern |
| `backend-signals/src/index.ts` | 13 | CORS origin whitelist |
| `scripts/smoke_signals.sh` | 14 | Default `BASE` URL |

**Risk**: If IP changes, 13 files need updating. Should centralize to one constant + `.env.production`.

### B3. CONSOLE.LOG POLLUTION

**112 console.log/warn/error calls** across 30 frontend files. Top offenders:

| File | Count | Notes |
|------|-------|-------|
| `hooks/useSwap.ts` | 25 | `[Swap Lifecycle]` prefix |
| `services/quoteAggregator.ts` | 14 | `[1inch Quote]`, `[PCS Quote]` etc. |
| `utils/testMatrix.ts` | 10 | Test instructions (not actual tests) |
| `services/oneInchTxBuilder.ts` | 8 | Debug logging |
| `hooks/useSolanaSwap.ts` | 7 | `[Solana Swap]` prefix |

**Recommendation**: Replace with `frontend/src/services/logger.ts` (already exists!) or strip in production build.

### B4. STALE GIT BRANCHES

**15 remote branches** (all `claude/*`) besides `main` and current branch. These are leftover from previous Claude Code sessions and can be pruned.

### B5. `vps-auto-update.sh` BUGS

| Bug | Line | Issue |
|-----|------|-------|
| Wrong path | 22 | `REPO_DIR="/opt/swaperex/Swaperex"` — actual VPS repo is at `/root/Swaperex` |
| Wrong PM2 names | 109-110 | `pm2 restart swaperex-frontend` / `swaperex-backend` — actual names are `frontend` / `backend-signals` |
| Stale backend ref | 89-93 | Checks `backend/package.json` — should be `backend-signals/package.json` |
| No rsync to nginx | — | Rebuilds `frontend/dist/` but never copies to `/var/www/swaperex` |

### B6. TODO ITEMS IN PRODUCTION CODE

| File | Line | TODO |
|------|------|------|
| `src/swaperex/api/routers/withdrawal.py` | 301 | `TODO: integrate with ledger` |
| `src/swaperex/api/routers/webhook.py` | 199 | `TODO: Send Telegram notification` |

### B7. DISK USAGE OBSERVATIONS

| Item | Size | Action |
|------|------|--------|
| `frontend/node_modules/` | 263 MB | Normal for React+ethers+solana/web3 |
| `backend-signals/node_modules/` | 66 MB | Normal |
| `frontend/dist/` | 5.9 MB | Includes 4.7 MB source map |
| `backend/` (dead) | 121 KB | Delete |

---

## C) Cleanup Plan

### Phase 1: Backups & Snapshot

Run on VPS:

```bash
# Create trash directory
TRASH="/root/_trash_$(date +%Y%m%d)"
mkdir -p "$TRASH"

# Snapshot: list of all processes, ports, nginx config, pm2 state
date > "$TRASH/snapshot_time.txt"
uname -a >> "$TRASH/snapshot_time.txt"
ss -lntup > "$TRASH/ss_snapshot.txt" 2>/dev/null
pm2 save  # saves current PM2 state to ~/.pm2/dump.pm2
cp ~/.pm2/dump.pm2 "$TRASH/pm2_dump_backup.pm2"
nginx -T > "$TRASH/nginx_full_config.txt" 2>/dev/null
pm2 ls > "$TRASH/pm2_ls.txt" 2>/dev/null
crontab -l > "$TRASH/crontab_backup.txt" 2>/dev/null || true

# Backup nginx configs
cp -a /etc/nginx/sites-available "$TRASH/nginx-sites-available/"
cp -a /etc/nginx/sites-enabled "$TRASH/nginx-sites-enabled/"
cp -a /etc/nginx/conf.d "$TRASH/nginx-conf.d/"

echo "Backups saved to $TRASH"
ls -la "$TRASH/"
```

**Rollback**: Restore from `$TRASH/` directory.

### Phase 2: Disable Unused Nginx Configs

Run on VPS:

```bash
TRASH="/root/_trash_$(date +%Y%m%d)"

# List what's in conf.d (likely old/stale)
ls -la /etc/nginx/conf.d/

# Disable any old domain configs (bots.armcoincrypto.am etc.)
# Move to .disabled instead of deleting
for f in /etc/nginx/conf.d/*.conf; do
  [ -f "$f" ] || continue
  echo "Disabling: $f"
  mv "$f" "${f}.disabled"
done

# Verify nginx config is still valid
nginx -t

# If nginx -t passes:
systemctl reload nginx

# Verify site still works
curl -sS -D- http://127.0.0.1/ -o /dev/null | head -5
curl -sS -D- http://207.180.212.142/ -o /dev/null | head -5
```

**Rollback**:
```bash
# Re-enable configs
for f in /etc/nginx/conf.d/*.disabled; do
  mv "$f" "${f%.disabled}"
done
nginx -t && systemctl reload nginx
```

### Phase 3: Ensure Correct Nginx default_server + Cache Headers

Review your `/etc/nginx/sites-available/swaperex` and ensure it has proper cache headers. Proposed config:

```bash
cat > /etc/nginx/sites-available/swaperex << 'NGINX_EOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name 207.180.212.142 swaperex.com www.swaperex.com _;

    root /var/www/swaperex;
    index index.html;

    # SPA fallback: serve index.html for all routes
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Hashed assets: immutable cache (1 year)
    location /assets/ {
        expires 365d;
        add_header Cache-Control "public, max-age=31536000, immutable";
        access_log off;
    }

    # index.html: never cache (so new deploys are picked up)
    location = /index.html {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header Pragma "no-cache";
    }

    # version.txt: no cache (deploy verification)
    location = /version.txt {
        add_header Cache-Control "no-cache";
    }

    # Proxy signals API (optional: if frontend should use /api/ instead of direct IP:4001)
    location /signals-api/ {
        proxy_pass http://127.0.0.1:4001/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # Block dotfiles
    location ~ /\. {
        deny all;
        return 404;
    }
}
NGINX_EOF

nginx -t && systemctl reload nginx
```

**Rollback**:
```bash
TRASH="/root/_trash_$(date +%Y%m%d)"
cp "$TRASH/nginx-sites-available/swaperex" /etc/nginx/sites-available/swaperex
nginx -t && systemctl reload nginx
```

### Phase 4: Standardize Frontend Deploy Flow

See **Section F: Golden Deploy Script** below for the full script.

Quick summary of the deploy flow:
1. `cd /root/Swaperex && git pull origin main`
2. `cd frontend && npm ci && npm run build`
3. `rsync -a --delete frontend/dist/ /var/www/swaperex/`
4. Write `version.txt` with git SHA + timestamp
5. `nginx -t && systemctl reload nginx`
6. Smoke test with curl

### Phase 5: PM2 Cleanup

Run on VPS:

```bash
# Check current state
pm2 ls

# If frontend app is stopped and nginx serves static, delete it from PM2
pm2 stop frontend 2>/dev/null || true
pm2 delete frontend 2>/dev/null || true

# Verify backend-signals is healthy
pm2 show backend-signals

# Save PM2 state (so it persists across reboots)
pm2 save

# Ensure PM2 startup hook is installed
pm2 startup
```

**Rollback**:
```bash
# Re-add frontend PM2 app if needed
cd /root/Swaperex
pm2 start ecosystem.config.cjs --only frontend
pm2 save
```

### Phase 6: Logs & Disk Cleanup

Run on VPS:

```bash
# Check current log sizes
du -sh /root/Swaperex/logs/ 2>/dev/null
du -sh /var/log/nginx/
journalctl --disk-usage

# Trim PM2 logs (keeps last 1000 lines)
pm2 flush

# Rotate nginx logs if not already set up
ls -la /etc/logrotate.d/nginx

# Vacuum old journal entries (keep 7 days)
journalctl --vacuum-time=7d

# Remove old build artifacts from trash after verifying everything works (wait 1 week)
# rm -rf /root/_trash_20260215  # ← only AFTER verification period
```

### Phase 7: Repo Cleanup (safe to run locally)

```bash
cd /root/Swaperex

# 7a. Archive dead backend/ directory
TRASH="/root/_trash_$(date +%Y%m%d)"
mkdir -p "$TRASH"
mv backend/ "$TRASH/backend_archived/"
echo "Moved backend/ to $TRASH/backend_archived/"

# 7b. Remove react-router-dom (unused dependency)
cd frontend
npm uninstall react-router-dom
cd ..

# 7c. Update ecosystem.config.cjs — remove frontend app entry
# (manual edit — keep only backend-signals app)

# 7d. Prune stale remote branches (review list first!)
git branch -r | grep -v main | grep -v "explore-codebase-tbXec"
# Then for each confirmed-stale branch:
# git push origin --delete claude/week1-error-messages-MbWJa
# git push origin --delete claude/week2-safety-signals-MbWJa
# ... etc (see list in Section B4)
```

---

## D) Verification Checklist

Run on VPS after each phase:

```bash
echo "=== 1. Nginx Config Valid ==="
nginx -t

echo ""
echo "=== 2. HTTP Smoke Test (localhost) ==="
HTTP_CODE=$(curl -sS -o /dev/null -w "%{http_code}" http://127.0.0.1/)
echo "HTTP status: $HTTP_CODE"
[ "$HTTP_CODE" = "200" ] && echo "PASS" || echo "FAIL"

echo ""
echo "=== 3. HTTP Smoke Test (public IP) ==="
HTTP_CODE=$(curl -sS -o /dev/null -w "%{http_code}" http://207.180.212.142/)
echo "HTTP status: $HTTP_CODE"
[ "$HTTP_CODE" = "200" ] && echo "PASS" || echo "FAIL"

echo ""
echo "=== 4. HTTPS Check (should fail or redirect if no SSL) ==="
curl -k -sS -D- https://207.180.212.142/ -o /dev/null 2>&1 | head -3 || echo "No HTTPS (expected if no cert)"

echo ""
echo "=== 5. Asset Hash Check ==="
ASSET_JS=$(grep -oE '/assets/index-[^"]+\.js' /var/www/swaperex/index.html)
echo "Expected asset: $ASSET_JS"
[ -f "/var/www/swaperex${ASSET_JS}" ] && echo "PASS — file exists" || echo "FAIL — asset missing!"

echo ""
echo "=== 6. Version File ==="
cat /var/www/swaperex/version.txt 2>/dev/null || echo "No version.txt (deploy script not yet run)"

echo ""
echo "=== 7. PM2 Status ==="
pm2 ls

echo ""
echo "=== 8. Backend-Signals Health ==="
HTTP_CODE=$(curl -sS -o /dev/null -w "%{http_code}" http://127.0.0.1:4001/health)
echo "Signals health: $HTTP_CODE"
[ "$HTTP_CODE" = "200" ] && echo "PASS" || echo "FAIL"

echo ""
echo "=== 9. Open Ports ==="
ss -lntup | grep -E ':80 |:443 |:4001 |:8000 |:3000 |:9000 '

echo ""
echo "=== 10. Disk Usage ==="
df -h / | tail -1
du -sh /var/www/swaperex /root/Swaperex 2>/dev/null
```

---

## E) Repo Cleanup Suggestions (Safe — Propose Only)

### E1. Dead Dependency Detection

```bash
# Install depcheck (doesn't modify anything)
cd /root/Swaperex/frontend
npx depcheck --ignores="@types/*,autoprefixer,postcss,tailwindcss"
# Look for: unused dependencies, missing dependencies
```

### E2. Unused TypeScript Exports

```bash
# ts-prune finds exported symbols that are never imported
cd /root/Swaperex/frontend
npx ts-prune --ignore "index.ts" | head -50
```

### E3. Circular Dependency Detection

```bash
# madge finds circular imports
cd /root/Swaperex/frontend
npx madge --circular --extensions ts,tsx src/
```

### E4. Bundle Size Analysis

```bash
cd /root/Swaperex/frontend
npx vite-bundle-visualizer
# Opens a treemap showing what's in the 1.2MB JS bundle
```

### E5. Console.log Cleanup (Gradual)

The repo has a `frontend/src/services/logger.ts` already. Strategy:
1. Audit the logger module — ensure it supports dev-only logging
2. Replace `console.log` calls gradually (start with hooks/ and services/)
3. Use Vite's `define` to strip logs in production builds:
   ```ts
   // vite.config.ts
   define: {
     'import.meta.env.DEV': JSON.stringify(mode === 'development')
   }
   ```

### E6. Hardcoded IP Consolidation

All 13 files with `207.180.212.142` should import from one place:
- `frontend/src/utils/constants.ts:98` already has the centralized constant `RPC_PROXY_URL`
- **Fix**: Make the other 10 files import from `constants.ts` instead of re-reading `import.meta.env` directly

### E7. Source Map in Production

`frontend/dist/index-mbfh2hx2.js.map` is 4.7 MB — that's 80% of the dist folder. Options:
1. **Keep but don't serve** — nginx can block `*.map` files
2. **Remove from build** — set `build: { sourcemap: false }` in vite.config.ts
3. **Upload to error tracking** (Sentry) and strip from deploy

```nginx
# Add to nginx config to block source maps from public access
location ~* \.map$ {
    deny all;
    return 404;
}
```

---

## F) Golden Deploy Script

See `scripts/deploy-frontend.sh` (created alongside this report).

---

## G) Summary of Findings

### Critical Issues
1. **`vps-auto-update.sh` has wrong paths and PM2 names** — will silently fail
2. **`backend/` is dead code** — confusing and wastes space

### Medium Issues
3. **13 files with hardcoded production IP** — maintenance risk
4. **112 console.log calls** — noise in production
5. **`react-router-dom` installed but unused** — wasted bundle size
6. **15 stale remote branches** — clutter
7. **PM2 `frontend` app should be removed** (nginx serves static)
8. **Source maps served publicly** — exposes source code

### Low Issues
9. **2 TODO items in Python backend** — webhook notification + ledger integration
10. **No frontend component tests** — 29 tests exist but all utility/service level
11. **`serve` package in dependencies** — only needed if PM2 frontend app is used

### What's Working Well
- Clean separation: frontend SPA (non-custodial) / signals backend / Python bot
- Proper hashed asset filenames for cache busting
- `serve.json` cache headers are correct
- Docker Compose for Python stack is well-structured
- CI pipeline exists with ruff + pytest
- Signal smoke tests exist (`scripts/smoke_signals.sh`)
- GitHub webhook + auto-update infrastructure exists (just needs path fixes)
