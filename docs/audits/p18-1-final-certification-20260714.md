# P18.1 Final Certification — 20260714

## Verdict
`SWAPEREX_P18_1_OPERATOR_WALLET_NO_BROADCAST_CANARY_PASS_WITH_WARNINGS`

## Why warnings
1. Session is controlled EIP-1193/store-synced WalletConnect path (extensions disabled on prod UI); AppKit QR modal verified open, but no human handset pairing in this session.
2. ETH MAX skip/warning under seeded-balance harness; BNB path fully validates P18 safety.
3. Activity/recovery uses existing surfaces without fabricated transactions.
4. Observation T+15/T+30/T+1h scheduled — confirm files before claiming full hour if incomplete.

## Production
- Artifact: `883d8b58b1db224511b0a235532c687136823c2c`
- Mutation: NONE
- Broadcasts: NONE

## Evidence
`/root/Swaperex/docs/audits/raw/p18-1-20260714T203822Z-cert`
