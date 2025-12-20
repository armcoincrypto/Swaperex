# Phase 12 - Solana Integration (Jupiter)

## Overview

Solana uses a different architecture than EVM chains:
- **Wallet**: Phantom, Solflare, Backpack (not MetaMask)
- **Quotes**: Jupiter API (aggregator)
- **Transactions**: Solana-specific format (not EVM)
- **Signing**: Wallet signs locally (same security model)

## Prerequisites

Before implementing Phase 12:
- [ ] Phase 9-11 must be stable (ETH, BSC working)
- [ ] EVM swap flow fully tested
- [ ] No critical bugs in production

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Frontend  │────▶│ Jupiter API │────▶│   Phantom   │
│  (React)    │     │  (Quotes)   │     │  (Sign/Send)│
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                    ┌──────┴──────┐
                    │ Returns tx  │
                    │ for signing │
                    └─────────────┘
```

## Implementation Plan

### 1. Wallet Integration (`hooks/useSolanaWallet.ts`)

```typescript
// Use @solana/wallet-adapter-react
import { useWallet } from '@solana/wallet-adapter-react';
import { useConnection } from '@solana/wallet-adapter-react';

export function useSolanaWallet() {
  const { publicKey, signTransaction, connected } = useWallet();
  const { connection } = useConnection();

  return {
    address: publicKey?.toBase58(),
    isConnected: connected,
    signTransaction,
    connection,
  };
}
```

### 2. Jupiter Quote Service (`services/jupiterQuote.ts`)

```typescript
const JUPITER_API = 'https://quote-api.jup.ag/v6';

export async function getJupiterQuote(
  inputMint: string,
  outputMint: string,
  amount: string,  // in lamports
  slippageBps: number = 50
): Promise<JupiterQuoteResult> {
  const url = new URL(`${JUPITER_API}/quote`);
  url.searchParams.set('inputMint', inputMint);
  url.searchParams.set('outputMint', outputMint);
  url.searchParams.set('amount', amount);
  url.searchParams.set('slippageBps', slippageBps.toString());

  const response = await fetch(url);
  return response.json();
}
```

### 3. Jupiter Transaction Builder (`services/jupiterTxBuilder.ts`)

```typescript
export async function buildJupiterSwapTx(
  quoteResponse: JupiterQuoteResult,
  userPublicKey: string
): Promise<VersionedTransaction> {
  const response = await fetch(`${JUPITER_API}/swap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse,
      userPublicKey,
      wrapAndUnwrapSol: true,
    }),
  });

  const { swapTransaction } = await response.json();

  // Decode base64 transaction
  const tx = VersionedTransaction.deserialize(
    Buffer.from(swapTransaction, 'base64')
  );

  return tx;  // Return for wallet to sign
}
```

### 4. Swap Hook (`hooks/useSolanaSwap.ts`)

```typescript
export function useSolanaSwap() {
  const { signTransaction, connection, address } = useSolanaWallet();

  const swap = async (quote: JupiterQuoteResult) => {
    // 1. Build transaction
    const tx = await buildJupiterSwapTx(quote, address);

    // 2. Wallet signs
    const signedTx = await signTransaction(tx);

    // 3. Send to network
    const signature = await connection.sendRawTransaction(
      signedTx.serialize()
    );

    // 4. Confirm
    await connection.confirmTransaction(signature);

    return signature;
  };

  return { swap };
}
```

## Token Addresses (Solana)

```typescript
export const SOLANA_TOKENS = {
  SOL: 'So11111111111111111111111111111111111111112',  // Native SOL
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  BONK: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  JUP: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
  RAY: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
  ORCA: 'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE',
};
```

## Dependencies

```json
{
  "@solana/web3.js": "^1.87.0",
  "@solana/wallet-adapter-base": "^0.9.23",
  "@solana/wallet-adapter-react": "^0.15.35",
  "@solana/wallet-adapter-wallets": "^0.19.23",
  "@solana/wallet-adapter-phantom": "^0.9.24"
}
```

## Security Model

Same as EVM:
1. **Jupiter API** returns quote and unsigned transaction
2. **Frontend** shows preview to user
3. **Wallet** (Phantom/Solflare) signs locally
4. **Wallet** sends to Solana network
5. **NO server signing**, **NO private keys**

## UI Changes Required

1. Add chain selector (EVM vs Solana)
2. Detect Phantom wallet availability
3. Show Solana-specific token list
4. Display Solscan explorer links
5. Handle different address format (base58 vs hex)

## Timeline

Implement AFTER:
- Phase 9 (ETH Mainnet stable) ✅
- Phase 10 (1inch multi-chain) ✅
- Phase 11 (BSC/PancakeSwap) ✅

## Files to Create

```
frontend/src/
├── hooks/
│   └── useSolanaWallet.ts
│   └── useSolanaSwap.ts
├── services/
│   └── jupiterQuote.ts
│   └── jupiterTxBuilder.ts
├── tokens/
│   └── solana.json
└── config/
    └── solana.ts
```

## Notes

- Solana transactions are different from EVM
- No gas limit, but priority fees exist
- Transactions expire (~2 minutes)
- Use VersionedTransaction for Jupiter
- Handle SOL wrapping/unwrapping automatically
