# P18.1 WalletConnect Canary — 20260714

## Provenance
Live `version.txt` confirmed `883d8b5` before testing. No redeploy.

## Method
Production disables browser-extension inject. Canary uses controlled EIP-1193 provider + wallet store sync as `walletType=walletconnect`, plus WalletConnect AppKit modal/QR open check.

## Results
| Check | Result |
|-------|--------|
| Session connect (simulated WC) | PASS |
| Disconnect / reconnect | PASS |
| WalletConnect modal / QR UI | PASS |
| Desktop + 390×844 connected state | PASS |

Masked accounts: `0xA11c…0001`, `0xB0b0…0002`

Evidence: `/root/Swaperex/docs/audits/raw/p18-1-20260714T203822Z-cert`
