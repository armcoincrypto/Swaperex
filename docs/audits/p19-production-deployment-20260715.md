# P19 Production Deployment

Evidence: `/root/Swaperex/docs/audits/raw/p19-20260715T003823Z`
Production URL: https://dex.kobbex.com
Starting artifact: `883d8b58b1db224511b0a235532c687136823c2c`
Final artifact: `bd7dd943d46f1d4bced7dab36e95e452f82a59e2` (`bd7dd94`)
Release tag: `swaperex-p19-prod-20260715T004838Z-bd7dd94`
Branch: `release/swaperex-p19-mobile`


## Backup
`/var/www/swaperex-backup-p19-20260715T004837Z-pre-883d8b5` (+ deploy-time backup)

## Deploy
`scripts/deploy-frontend.sh` → `bd7dd94`, nginx reload.

## Rollback proof
Restored `883d8b5`; Connect overflow returned; re-deployed `bd7dd94`.
