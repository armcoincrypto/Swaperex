# P18 Production Truth — 20260714

## Scope
Swaperex only (`dex.kobbex.com`). Kobbopay / P7 untouched.

## Starting production
- URL: https://dex.kobbex.com
- Static: /var/www/swaperex
- Artifact: `d4484f051941084a7987cdf42c5f2de8f48b4b30` (`d4484f0`)
- Repo start HEAD: `480e51a` (docs) / feature branch created from certified baseline
- Backup: `/var/www/swaperex-backup-p18-20260714T115442Z-pre`

## Final production
- Artifact: `883d8b58b1db224511b0a235532c687136823c2c` (`883d8b5`)
- Branch: `feature/p18-transaction-safety-copy-clarity`
- Deployed: 2026-07-14T16:01:22Z (hotfix after 093f54f at 11:54:43Z)
- Signals PM2: backend-signals online, restart_time=0
- Admin uvicorn :8001 healthy; unauth `/api/v1/admin/overview` → 401
- Nginx: reloaded only; config checksum unchanged during P18

## Paths
- Repository: /root/Swaperex
- Release worktree (prior): /opt/swaperex-release-worktree
- Evidence: `docs/audits/raw/p18-20260714T115413Z`
