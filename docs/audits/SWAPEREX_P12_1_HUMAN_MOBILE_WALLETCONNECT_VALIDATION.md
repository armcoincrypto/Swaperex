# SWAPEREX P12.1 — Human Mobile WalletConnect Validation

**Date:** 2026-07-10  
**Production:** https://dex.kobbex.com · commit `eee0264`  
**Verdict:** `P12_1_HUMAN_MOBILE_WALLETCONNECT_DEFERRED`

---

## Executive verdict

P12.1 requires a **human operator** to scan a WalletConnect QR code with a mobile wallet. No human/device session was available in the automated agent environment. P11.2 headless smoke already validated modal/back regression; this phase is **deferred**, not failed.

**Does not block P12 program closeout.**

---

## Human/operator confirmation

| Field | Status |
|-------|--------|
| Mobile QR scan completed | **No** — deferred |
| Human approval of WC session | **Not recorded** |

---

## Safety controls

Assist script (`scripts/audit/p12-1-mobile-walletconnect-assist.mjs`) enforces:

- No seed phrase / private key / transaction / swap confirmation
- No storage of WC URI, pairing topic, or session keys
- Masked address in reports only
- Timeout → deferred verdict (exit 3)

---

## Evidence from related validation

| Check | Source | Result |
|-------|--------|--------|
| WC modal + QR view | P11.2 / P12.4 | **PASS** |
| Back from connecting view | P11.2 | **PASS** |
| ETH/WETH quotes (read-only) | P12.5 | **PASS** |

---

## Operator test matrix (pending)

When an operator completes P12.1 manually:

1. Open https://dex.kobbex.com  
2. WalletConnect → scan QR on phone  
3. Approve connection (no swap)  
4. ETH/WETH→USDT quotes (quote-only)  
5. Disconnect / reconnect / hard refresh / modal back  
6. Confirm no `w3m-connecting-view` crash  

Record browser, OS, wallet app, masked address, date/time in this doc appendix.

---

## Production impact

**None.** No deployment.

---

## Final verdict

`P12_1_HUMAN_MOBILE_WALLETCONNECT_DEFERRED`
