# Frontend Deployment

## Update dex.kobbex.com (production server)

1. **On your machine:** Push your changes and (optional) build locally with prod env:
   ```bash
   ./scripts/build-frontend.sh   # fetches VITE_WC_PROJECT_ID from server, builds frontend/dist/
   ```

2. **On the server** (SSH as root or deploy user):
   ```bash
   cd /root/Swaperex   # or /root/Swaperex-2 — set REPO_DIR if different, e.g. export REPO_DIR=/root/Swaperex-2
   git pull
   sudo REPO_DIR=/root/Swaperex-2 bash scripts/deploy-frontend.sh
   ```
   The script will: `npm ci` + build in `frontend/`, backup `/var/www/swaperex`, deploy `frontend/dist/` to `/var/www/swaperex`, write `version.txt`, remove `.map` files, reload nginx, run smoke tests.

3. **Restart backend-signals** (if you changed it):
   ```bash
   pm2 restart backend-signals
   ```
   **1inch:** Set `ONEINCH_API_KEY` in the **backend-signals** process environment (not in Vite). The browser calls same-origin `/oneinch/...` only; nginx must proxy `/oneinch/` to `:4001` (included in `scripts/nginx/dex.kobbex.com.conf`). After changing the key or nginx, reload nginx and restart backend-signals.

4. **Nginx:** Production site uses `scripts/nginx/dex.kobbex.com.conf`. To apply config changes:
   ```bash
   sudo bash scripts/apply-nginx-dex.sh
   ```

---

## WalletConnect (QR + mobile wallets)

**Required:** `VITE_WC_PROJECT_ID` must be set at **build/dev time** (Vite bakes it in).

1. Get a free project ID at [cloud.walletconnect.com](https://cloud.walletconnect.com)

2. **For local dev** (`npm run dev`): Put in `frontend/.env.local`:
   ```
   VITE_WC_PROJECT_ID=your_actual_project_id
   ```
   (Vite does NOT load `.env.production` during dev.)

3. **For production build** (`npm run build`): Either
   - Update `frontend/.env.production` with your real ID, or
   - Run from repo root: `./scripts/build-frontend.sh` (pulls ID from server via SSH), or
   - Pass at build time: `VITE_WC_PROJECT_ID=xxx npm run build`

4. **Rebuild** after changing env — Vite injects at compile time.

## API base

- **Production:** Uses relative `/api/v1` (no localhost)
- **Development:** Uses `http://localhost:8000` for main API, `http://localhost:4001` for signals

Override with `VITE_API_URL` / `VITE_SIGNALS_API_URL` if needed.

## dev.dex.kobbex.com (separate dev static host)

Isolated from production: **`/var/www/swaperex-dev`**, nginx vhost **`scripts/nginx/dev.dex.kobbex.com.conf`**.

Production **`dex.kobbex.com`** and **`/var/www/swaperex`** are untouched by dev scripts.

1. **First-time nginx + TLS** (on server):
   ```bash
   sudo mkdir -p /var/www/swaperex-dev
   sudo bash scripts/apply-nginx-dev.sh
   # If nginx -t fails on missing cert:
   sudo certbot certonly --webroot -w /var/www/swaperex-dev -d dev.dex.kobbex.com
   sudo nginx -t && sudo systemctl reload nginx
   ```

2. **Deploy dev frontend** (same backend APIs via nginx proxy as prod for now):
   ```bash
   cd /root/Swaperex
   git pull
   sudo bash scripts/deploy-dev-frontend.sh
   ```

3. **Verify**:
   ```bash
   bash scripts/audit/verify-dev-live.sh
   curl -sS https://dev.dex.kobbex.com/version.txt   # must include environment=dev
   ```

4. **Rollback dev only**:
   ```bash
   sudo rm -rf /var/www/swaperex-dev
   sudo mv /var/www/swaperex-dev-backup-<timestamp> /var/www/swaperex-dev
   sudo systemctl reload nginx
   sudo rm -f /etc/nginx/sites-enabled/dev.dex.kobbex.com.conf
   sudo nginx -t && sudo systemctl reload nginx
   ```

---

## Verify after deploy

1. Open https://dex.kobbex.com
2. Console should **NOT** show: `[AppKit] Missing VITE_WC_PROJECT_ID` (or similar WalletConnect warning)
3. Click Connect Wallet → WalletConnect → QR modal should open (AppKit)
4. No `ERR_CONNECTION_REFUSED` to localhost
