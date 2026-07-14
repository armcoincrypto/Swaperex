# P18.2 Production Truth — 20260715

## Provenance gate
**PROVENANCE_OK** — `version.txt` short=`883d8b5`, full=`883d8b58b1db224511b0a235532c687136823c2c`.

Evidence root: `/root/Swaperex/docs/audits/raw/p18-2-20260714T222824Z`
Production URL: https://dex.kobbex.com
Live artifact: `883d8b58b1db224511b0a235532c687136823c2c` (`883d8b5`)
Production mutation: **NONE** (no redeploy; live labels already correct)


## Repository (at audit start)
- HEAD: `421581ebe7c4effcb350cfb5559b8a6ea7505884` (docs after deploy)
- Branch: `feature/p18-transaction-safety-copy-clarity`
- Tag pointing near tip: `swaperex-p18-prod-20260714T160641Z-883d8b5` (deployed parent)
- Working tree: dirty with `.cursor/*`, prior raw evidence, plus P18.2 product/test edits

## Classification of commits after `883d8b5`
| Class | Content |
|-------|---------|
| Product code | None deployed; P18.2 repo adds label-source consolidation + tests only |
| Tests | Deepened safe-MAX / route / stats invariants |
| Canary scripts | Reused P18.1 operator canary |
| Audit documents | This P18.2 suite |
| Temporary / Cursor / unrelated | Excluded from release commit |

## Runtime
- nginx: config OK; checksum recorded in evidence
- PM2: `backend-signals` online; `frontend` stopped (static nginx serves `/var/www/swaperex`)
- Admin `:8001` overview → **401** (expected unauthorized)
- Signals health → **200**

## Decision
No unexpected provenance change. Proceeded with hardening audit without blocking.
