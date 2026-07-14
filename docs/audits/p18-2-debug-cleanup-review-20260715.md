# P18.2 Debug / Cleanup Review — 20260715

Evidence root: `/root/Swaperex/docs/audits/raw/p18-2-20260714T222824Z`
Production URL: https://dex.kobbex.com
Live artifact: `883d8b58b1db224511b0a235532c687136823c2c` (`883d8b5`)
Production mutation: **NONE** (no redeploy; live labels already correct)


## Cleanup performed
- Removed duplicate `ROUTE_PROVIDER_LABEL` map; single presentation source.
- Deepened unit coverage for MAX / affordability / stats / label alignment.
- **ESLint Option C**: retain `npm run lint` warning — deps present, **no project-local config**; adding a full config would create broad unrelated churn. Documented, not migrated.

## Not deleted
Certification evidence under `docs/audits/raw/*`, rollback backups, active canary harnesses.

## Console
Operator canary / browser cert: no critical pageerror storm; aggregator may still `console.warn` on internal canary-evaluation failures (operator diagnostic, not public wording).
