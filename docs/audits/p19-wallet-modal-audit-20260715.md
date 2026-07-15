# P19 Wallet Modal Audit

Evidence: `/root/Swaperex/docs/audits/raw/p19-20260715T003823Z`
Production URL: https://dex.kobbex.com
Starting artifact: `883d8b58b1db224511b0a235532c687136823c2c`
Final artifact: `bd7dd943d46f1d4bced7dab36e95e452f82a59e2` (`bd7dd94`)
Release tag: `swaperex-p19-prod-20260715T004838Z-bd7dd94`
Branch: `release/swaperex-p19-mobile`


## Findings
- AppKit opens after picking WalletConnect.
- Picker z-index `z-[60]` above bottom nav `z-40`.
- No AppKit fork/rewrite.
- QR remains available as second-device path; copy no longer implies QR-only on the same phone.
