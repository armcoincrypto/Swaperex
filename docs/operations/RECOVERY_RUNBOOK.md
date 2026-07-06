# Swaperex Production Recovery Runbook

**Product scope:** Swaperex only — https://dex.kobbex.com  
**Deploy directory:** `/var/www/swaperex`

**Out of scope:** Shared nginx, other Kobbex/Kobbopay hosts, payment infrastructure. Swaperex recovery is static asset + live validation only.

---

## Emergency stop conditions

Stop and escalate if:

- `verify-live.sh` fails for **dex.kobbex.com**
- Entry bundle 404 or wrong hash vs local build
- `/api/health` on dex.kobbex.com returns HTML (SPA misroute)
- rsync failed or `/var/www/swaperex` is empty/corrupt

Do **not** run another deploy until root cause is identified.

---

## Rollback to previous commit (Swaperex static only)

### 1. Identify last known good commit

```bash
curl -sS https://dex.kobbex.com/version.txt
ls -lt /root/Swaperex/scripts/logs/prod-deploy.*.log | head -3
```

### 2. Checkout and rebuild

```bash
cd /root/Swaperex
git fetch origin
git checkout <GOOD_COMMIT_SHA>
cd frontend && npm ci && npm run build
```

### 3. Restore static assets

```bash
rsync -a --delete frontend/dist/ /var/www/swaperex/
git rev-parse HEAD | xargs -I{} sh -c 'cat > /var/www/swaperex/version.txt <<EOF
environment=production
commit={}
short=$(git rev-parse --short HEAD)
branch=$(git branch --show-current)
deployed=$(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF'
```

### 4. Verify dex.kobbex.com

```bash
cd /root/Swaperex
bash scripts/audit/deploy-match.sh
bash scripts/audit/verify-live.sh
bash scripts/audit/post-deploy-certification.sh
```

### 5. Return main branch

```bash
git checkout main && git pull --ff-only origin main
```

---

## Static asset recovery

```bash
cd /root/Swaperex/frontend
npm run build
rsync -a --delete dist/ /var/www/swaperex/
bash ../scripts/audit/verify-live.sh
```

No nginx reload required for static recovery.

---

## Shared nginx — out of Swaperex scope

Swaperex deploy tooling **does not**:

- Run `systemctl reload nginx` or `systemctl restart nginx`
- Edit or restore `/etc/nginx/nginx.conf` or any vhost config
- Inspect or modify configs for merchant.kobbex.com, pay.kobbex.com, appadmin.kobbex.com, api.kobbex.com

If dex.kobbex.com is down due to platform/nginx issues affecting multiple hosts, escalate to platform/infrastructure team — not via Swaperex frontend redeploy.

If dex.kobbex.com live checks pass, Swaperex is considered recovered regardless of shared nginx state.

---

## Live verification (dex.kobbex.com only)

```bash
curl -sS -o /dev/null -w "%{http_code}\n" https://dex.kobbex.com/
curl -sS https://dex.kobbex.com/api/health | jq .
curl -sS https://dex.kobbex.com/version.txt
bash /root/Swaperex/scripts/audit/verify-live.sh
bash /root/Swaperex/scripts/audit/deploy-match.sh
bash /root/Swaperex/scripts/audit/post-deploy-certification.sh
```

---

## Deploy log evidence

```bash
ls -lt /root/Swaperex/scripts/logs/prod-deploy.*.log
```

Do not delete `scripts/logs/prod-deploy.*.log`.

---

## Rollback one-liner

```bash
rsync -a --delete /root/Swaperex/frontend/dist/ /var/www/swaperex/ && \
  bash /root/Swaperex/scripts/audit/verify-live.sh
```
