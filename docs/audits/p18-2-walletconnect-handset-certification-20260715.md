# P18.2 WalletConnect Handset Certification — 20260715

Evidence root: `/root/Swaperex/docs/audits/raw/p18-2-20260714T222824Z`
Production URL: https://dex.kobbex.com
Live artifact: `883d8b58b1db224511b0a235532c687136823c2c` (`883d8b5`)
Production mutation: **NONE** (no redeploy; live labels already correct)


## Physical handset pairing
**SKIP_WITH_JUSTIFICATION** — no controlled operator phone in this automated session.

## What was proven instead
1. AppKit WalletConnect QR/modal opens (headless 390 + canary).
2. Simulated WalletConnect session (`walletType: walletconnect`) with masked `0xA11c…0001`.
3. Disconnect / reconnect **PASS**.
4. Account change / chain change **PASS**.
5. Wallet rejection path — **no approval/swap broadcast**.

## Residual risk
Real-world device QR scan + mobile approve UX not human-certified in P18.2; deferred to operator when handset available. Product path is the same AppKit modal already opening in production.
