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

## Verify after deploy

1. Open https://dex.kobbex.com
2. Console should **NOT** show: `[AppKit] Missing VITE_WC_PROJECT_ID` (or similar WalletConnect warning)
3. Click Connect Wallet → WalletConnect → QR modal should open (AppKit)
4. No `ERR_CONNECTION_REFUSED` to localhost
