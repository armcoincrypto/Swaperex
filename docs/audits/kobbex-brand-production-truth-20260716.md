# Kobbex Brand Unification — Production & Source Truth (2026-07-16)

## Starting production artifact (pre-deploy)

```
environment=production
commit=d8a929493227b97f51c7682e1362256b8a9f0716
short=d8a9294
branch=release/swaperex-p20-2-production-quality-closure
deployed=2026-07-16T14:21:30Z
```

- Production URL: https://dex.kobbex.com
- `/version.txt` fetched via localhost resolve: matches the above.
- Live `index.html` (before): **6× "Swaperex", 3× "by Kobbex"** (see `raw/.../before/live-index.html`).

## Repository state at start

- Starting HEAD: `195a6bef57ec9c3c001521a9024693f63e4abcde`
- Starting branch: `release/swaperex-p20-2-production-quality-closure`
- New work branch: `release/kobbex-dex-brand-unification`
- Test baseline (P20.2): 74 files / 704 tests / commission 126/126.

## Scope

Public-facing brand migration `Swaperex → Kobbex`. No changes to swap execution,
wallet, quote, gas, MAX, commission, routing, or contract logic. Internal
identifiers, storage keys, git history, and historical audits are preserved.
