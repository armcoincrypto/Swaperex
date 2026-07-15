# P19 Root Cause — Mobile WalletConnect

Evidence: `/root/Swaperex/docs/audits/raw/p19-20260715T003823Z`
Production URL: https://dex.kobbex.com
Starting artifact: `883d8b58b1db224511b0a235532c687136823c2c`
Final artifact: `bd7dd943d46f1d4bced7dab36e95e452f82a59e2` (`bd7dd94`)
Release tag: `swaperex-p19-prod-20260715T004838Z-bd7dd94`
Branch: `release/swaperex-p19-mobile`


## Defect
On every tested portrait mobile viewport, the header **Connect Wallet** control was laid out at `x > viewport width` (e.g. x≈361 on 390×844). `elementFromPoint` did not hit Connect — users could not reach WalletConnect.

## Cause
Sticky header packed **logo + horizontal mobile page nav (Trade/Portfolio/Security/Markets) + View address + Connect Wallet**. The wallet cluster was pushed off-screen. Playwright could force-click; real touch could not.

## Fix
1. Remove inline mobile page nav from the top bar.
2. Add fixed bottom primary nav (`sm:hidden`) with safe-area padding.
3. Compact mobile Connect label; hide header View address on `<sm` (kept in picker).
4. Mobile-safe WalletConnect / connecting copy (app open + QR fallback).
5. `shrink-0` wallet cluster; 44px min touch targets.

## Result
Live post-deploy: Connect in-viewport, uncovered, picker opens, AppKit modal opens on all listed portrait sizes.
