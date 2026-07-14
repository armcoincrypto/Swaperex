# P18 Production Deployment — 20260714

## Mutation
Frontend static only (`/var/www/swaperex`).

## Timeline
1. Backup `/var/www/swaperex-backup-p18-20260714T115442Z-pre` (d4484f0)
2. Deploy `093f54f` at 2026-07-14T11:54:43Z via `scripts/deploy-frontend.sh`
3. Hotfix deploy `883d8b5` at 2026-07-14T16:01:22Z (Popular certified routes heading)
4. Nginx reload only; config unchanged
5. Services: backend-signals / admin uvicorn **not** restarted for P18
6. Kobbopay / P7 / DBs / watchers: untouched

## Smoke
Homepage 200, Trust 200, signals health 200, admin unauth 401, version contains `883d8b5`

## Rollback
Proven restore of d4484f0 backup then forward restore of `883d8b5` (see rollback-proof.log)
