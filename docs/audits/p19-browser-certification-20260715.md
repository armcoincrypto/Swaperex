# P19 Browser Certification

Evidence: `/root/Swaperex/docs/audits/raw/p19-20260715T003823Z`
Production URL: https://dex.kobbex.com
Starting artifact: `883d8b58b1db224511b0a235532c687136823c2c`
Final artifact: `bd7dd943d46f1d4bced7dab36e95e452f82a59e2` (`bd7dd94`)
Release tag: `swaperex-p19-prod-20260715T004838Z-bd7dd94`
Branch: `release/swaperex-p19-mobile`


## Portrait matrix
320 / 360 / 375 / 390 / 393 / 412 / 430 — Connect in-viewport, picker, AppKit modal PASS.

## Landscape sample
390 / 412 — Connect PASS; bottom nav hidden when width ≥ `sm` (desktop nav appears) — expected.

## Desktop 1440×900
PASS — Connect visible; mobile bottom nav hidden.
