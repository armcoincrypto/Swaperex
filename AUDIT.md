# Swaperex Repo & Server Audit

**Date:** 2026-02-16
**Branch:** main
**HEAD:** d0e5cd9

---

## A. Directory Inventory

| Directory / File | Purpose | Status |
|---|---|---|
| `frontend/` | Vite/React SPA — swap UI, radar, wallet, signals display | **ACTIVE** — core product |
| `backend-signals/` | Fastify API on :4001 — smart signals with cooldown, dedup, scoring | **ACTIVE** — deployed via PM2 |
| `backend/` | Older Fastify signals API on :3001 — basic liquidity/whale/risk | **DEAD** — superseded by backend-signals |
| `src/swaperex/` | Python package: FastAPI + Telegram bot + deposit scanners + withdrawal | **ACTIVE** — core backend |
| `tests/` | Python pytest suite (api, components, ledger, router) | **ACTIVE** |
| `docs/product/` | 12 product spec files (mission, UX, swap machine, 30-day plan) | **ACTIVE** — reference docs |
| `scripts/` | Shell scripts for dev, deploy, migration | **MIXED** — see below |
| `.github/workflows/` | CI pipeline (lint + test + docker build) | **ACTIVE** |
| `.devcontainer/` | VS Code dev container config | **ACTIVE** |
| `Dockerfile` / `Dockerfile.dev` | Production + dev Docker images (Python only) | **ACTIVE** |
| `docker-compose.yml` / `docker-compose.dev.yml` | Multi-service orchestration (Python services only) | **ACTIVE** |
| `ecosystem.config.cjs` | PM2 config for frontend + backend-signals | **ACTIVE but needs path fix** |

---

## B. "Likely Dead" Candidates

### B1. `backend/` directory — DEAD

**Evidence:**
- Superseded by `backend-signals/` (same signals concept, but backend-signals has 9 commits of enhancements: cooldown, escalation, dedup, impact scoring, recurrence, debug mode, API versioning)
- `backend/` has localhost-only CORS; `backend-signals/` has production CORS (swaperex.com, VPS IP)
- `backend/` has no node_modules, no dist — never built on server
- `backend/` is only referenced in `scripts/vps-auto-update.sh` (which itself is stale)
- Docker/CI never reference `backend/`
- PM2 ecosystem config references `backend-signals/`, not `backend/`

**Rollback plan:** `git stash` or branch before deletion. Files remain in git history.

### B2. `scripts/vps-auto-update.sh` — STALE

**Evidence:**
- Hardcodes `/opt/swaperex/Swaperex` (actual server path is `/root/Swaperex`)
- References `backend/` (dead) and PM2 service name `swaperex-backend` (actual is `backend-signals`)
- Does not deploy to `/var/www/swaperex` or write version.txt
- Replaced by new `scripts/deploy-frontend.sh`

### B3. `scripts/webhook-server.js` — STALE

**Evidence:**
- Requires Express but Express is not in any package.json
- References `/opt/swaperex/vps-auto-update.sh` (the stale script)
- Placeholder secret: `'your-webhook-secret'`
- Not deployed or referenced anywhere

### B4. Frontend markdown docs (16 files) — PLANNING ARTIFACTS

Files: `BACKEND_VERIFICATION.md`, `EDGE_CASE_TESTS.md`, `ERROR_HANDLING_UX.md`, `INTEGRATION_PLAN.md`, `INTEGRATION_TEST_PLAN.md`, `MANUAL_QA_GUIDE.md`, `PAGE_MAPPING.md`, `QA_VERIFICATION_REPORT.md`, `SCOPE.md`, `SECURITY_AUDIT.md`, `SWAP_PREVIEW_UX.md`, `TESTING_AUDIT.md`, `UX_GUIDELINES.md`, `WALLET_FLOW.md`, `WALLET_UX.md`, `WITHDRAWAL_UX.md`

**Evidence:**
- All are planning/spec documents from development phases
- None are served or referenced in build
- 16 markdown files in `frontend/` cluttering the directory

**Recommendation:** Move to `docs/frontend/` or keep as-is (low priority, no harm).

### B5. `frontend/src/services/PHASE12_SOLANA_JUPITER.md` — MISPLACED DOC

**Evidence:** Markdown file inside `src/services/` — should be in `docs/` if kept.

---

## C. Unused Frontend Dependencies

| Package | In package.json | Imported anywhere? | Verdict |
|---|---|---|---|
| `@headlessui/react` | ^1.7.17 | No | **REMOVE** |
| `@heroicons/react` | ^2.1.1 | No | **REMOVE** |
| `@web3modal/ethers` | ^3.5.0 | No | **REMOVE** |
| `bs58` | ^5.0.0 | No | **REMOVE** |
| `react-hot-toast` | ^2.4.1 | No (custom toast via zustand) | **REMOVE** |
| `react-router-dom` | ^6.20.0 | No (SPA, no routing) | **REMOVE** |

**Used (keep):** react, react-dom, ethers, @solana/web3.js, axios, zustand, clsx

**All devDeps are used** (vite, typescript, tailwind, postcss, eslint, prettier, react plugin, types).

---

## D. Configuration Issues

### D1. `ecosystem.config.cjs` — Hardcoded /root paths

```javascript
cwd: "/root/Swaperex/frontend"    // works on current VPS, but fragile
cwd: "/root/Swaperex/backend-signals"
```

**Fix:** Leave as-is if VPS stays at /root, or parameterize.

### D2. `vite.config.ts` — Source maps enabled in production

```typescript
build: {
    outDir: 'dist',
    sourcemap: true,   // generates .map files
}
```

**Fix:** Either set `sourcemap: false` or (current approach) delete .map files during deploy. The deploy script already handles this.

### D3. No nginx config in repo

There's no nginx `.conf` file checked into the repo. This means the server config is only on the VPS.

**Recommendation:** Add `nginx/swaperex.conf` to repo as reference.

---

## E. Recommended Nginx Config

Save to repo as `nginx/swaperex.conf` — deploy to `/etc/nginx/sites-available/swaperex` on VPS.

```nginx
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    root /var/www/swaperex;
    index index.html;

    # ── Security: block dotfiles (.env, .git, etc.) ──
    location ~ /\. {
        deny all;
        return 404;
    }

    # ── Security: block source maps ──
    location ~* \.map$ {
        deny all;
        return 404;
    }

    # ── API reverse proxy to backend-signals ──
    location /api/ {
        proxy_pass http://127.0.0.1:4001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts
        proxy_connect_timeout 10s;
        proxy_read_timeout 30s;
        proxy_send_timeout 10s;
    }

    # ── Static assets: aggressive caching ──
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    # ── version.txt: no caching ──
    location = /version.txt {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        try_files $uri =404;
    }

    # ── SPA fallback ──
    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache";
    }

    # ── Logging ──
    access_log /var/log/nginx/swaperex-access.log;
    error_log  /var/log/nginx/swaperex-error.log;
}
```

**Key features:**
- `default_server` — catches all Host headers (no redirect loops)
- Dotfiles blocked (`.env`, `.git`, etc.)
- Source maps blocked
- `/assets/` cached 1 year (Vite hashes filenames, so cache-bust is automatic)
- `/version.txt` never cached
- SPA fallback for client-side routing
- API proxied to backend-signals on :4001

---

## F. Phased Cleanup Checklist

### Phase 0: Backup (before any destructive action)

```bash
# On VPS:
cp -a /var/www/swaperex /var/www/swaperex-backup-$(date +%F)
cp /etc/nginx/sites-available/swaperex /etc/nginx/swaperex.conf.bak-$(date +%F) 2>/dev/null || true
pm2 save

# In repo:
git checkout -b backup/pre-cleanup-$(date +%F)
git push origin backup/pre-cleanup-$(date +%F)
```

**Verify:**
```bash
ls -la /var/www/swaperex-backup-*
git branch -a | grep backup
```

---

### Phase 1: Remove Dead Code (repo)

| Step | Action | Verify |
|---|---|---|
| 1.1 | Delete `backend/` directory | `ls backend/` should fail; `git diff --stat` shows removals |
| 1.2 | Remove `backend/` reference from `scripts/vps-auto-update.sh` lines 89-93 | `grep -n backend scripts/vps-auto-update.sh` shows no refs |
| 1.3 | Move `frontend/*.md` (16 files) to `docs/frontend/` | `ls docs/frontend/` shows moved files |
| 1.4 | Move `frontend/src/services/PHASE12_SOLANA_JUPITER.md` to `docs/frontend/` | Source dir is code-only |

**Verify after phase:**
```bash
git diff --stat
npm run build --prefix frontend   # frontend still builds
```

---

### Phase 2: Dependency Cleanup (frontend)

```bash
cd frontend
npm uninstall @headlessui/react @heroicons/react @web3modal/ethers bs58 react-hot-toast react-router-dom
npm run build
```

**Verify:**
```bash
# Build must succeed
ls dist/index.html

# No import errors
grep -r '@headlessui\|@heroicons\|@web3modal\|bs58\|react-hot-toast\|react-router-dom' src/
# ^ should return nothing
```

---

### Phase 3: Security Hardening

| Step | Action | Verify |
|---|---|---|
| 3.1 | Deploy `nginx/swaperex.conf` to VPS `/etc/nginx/sites-available/swaperex` | `nginx -t` succeeds |
| 3.2 | Symlink to sites-enabled, remove other server blocks | Only 1 file in `sites-enabled/` |
| 3.3 | `systemctl reload nginx` | `curl http://127.0.0.1/` returns 200 |
| 3.4 | Test dotfile blocking | `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/.env` returns 404 |
| 3.5 | Test .map blocking | `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/test.map` returns 404 |
| 3.6 | (Optional) Set `sourcemap: false` in `vite.config.ts` | Double protection — maps not generated at all |

**VPS commands for Phase 3:**
```bash
# Copy config to VPS (from your local machine):
scp nginx/swaperex.conf root@207.180.212.142:/etc/nginx/sites-available/swaperex

# On VPS:
ln -sf /etc/nginx/sites-available/swaperex /etc/nginx/sites-enabled/swaperex
# Remove any other enabled sites that conflict:
ls /etc/nginx/sites-enabled/
# rm /etc/nginx/sites-enabled/default  (if it exists and conflicts)

nginx -t && systemctl reload nginx

# Verify:
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/      # 200
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/.env   # 404
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/.git   # 404
```

---

### Phase 4: Deploy Confirmation

```bash
# On VPS:
cd /root/Swaperex
git pull origin main

# Run the golden deploy:
sudo bash scripts/deploy-frontend.sh

# Run the inventory to confirm everything:
bash scripts/server-inventory.sh

# Verify version marker:
curl http://207.180.212.142/version.txt
# Should show current commit hash + timestamp
```

**Post-deploy checks:**
```bash
curl -s http://207.180.212.142/             # 200 + HTML
curl -s http://207.180.212.142/version.txt  # commit hash visible
curl -s http://207.180.212.142/api/health   # 200 (if backend-signals running)
curl -s -o /dev/null -w '%{http_code}' http://207.180.212.142/.env  # 404
```

---

## G. Scripts Reference

| Script | Purpose | Run as |
|---|---|---|
| `scripts/deploy-frontend.sh` | **NEW** — Golden deploy: build, deploy, version, reload, smoke test | `sudo bash` on VPS |
| `scripts/server-inventory.sh` | **NEW** — Read-only VPS diagnostic inventory | `bash` on VPS |
| `scripts/run_all.sh` | Start all Python services (API + scanners + bot) | Dev |
| `scripts/run_api.sh` | Start API only with auto-setup | Dev |
| `scripts/run_bot.sh` | Start Telegram bot only | Dev |
| `scripts/run_tests.sh` | Run pytest suite | Dev / CI |
| `scripts/start_dev.sh` | Full dev startup (bot + API) | Dev |
| `scripts/vps-auto-update.sh` | **STALE** — old auto-update (wrong paths, wrong services) | Deprecate |
| `scripts/webhook-server.js` | **STALE** — GitHub webhook listener (missing deps) | Deprecate |
