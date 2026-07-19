# Kobbex P21.4 Wallet No-Broadcast Automation

Timestamp: 20260719T171436Z
Base URL: http://127.0.0.1:4177
Mode: no_broadcast
Treasury (asserted): 0x509Cfd32ce279E08010C143F90Cc1782a3520196

## Totals

```text
WALLET_JOURNEYS_PASS=11
WALLET_JOURNEYS_FAIL=0
SEND_REQUESTS_INTERCEPTED=6
NETWORK_BROADCASTS=0
UNSUPPORTED_ROUTE_SEND_ATTEMPTS=0
```

## Journeys

- **eth-native-usdc**: PASS
- **eth-erc20-weth-usdc**: PASS
- **bnb-native-usdt**: PASS
- **bnb-erc20-cake-usdt**: PASS
- **wallet-rejections**: PASS
- **wrong-network**: PASS
- **account-change**: PASS
- **chain-change**: PASS
- **unsupported-routes**: PASS
- **mobile-viewport**: PASS
- **walletconnect-modal-smoke**: PASS

## Production artifact scan

```json
{
  "distExists": true,
  "testWalletDisabled": true,
  "debugWalletRouteAbsent": true,
  "noFakeAccountExposed": true,
  "noTestPrivateKey": true,
  "noSimulationUi": true,
  "findings": []
}
```

## WalletConnect

Shared post-connection path certified via EIP-1193 harness; live WC QR pairing not exercised


Artifacts: `/root/Swaperex-route-truth-20260718/artifacts/wallet-automation/20260719T171436Z`
