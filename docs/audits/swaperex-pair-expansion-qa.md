# SWAPEREX PAIR EXPANSION — MANUAL WALLET QA

**Scope:** New and re-verified pairs after 2026-07-07 dry-run audit.  
**Chains:** Ethereum (1), BNB Chain (56) only.  
**Do not broadcast** until checklist complete and implementation report approved.

---

## New BSC pairs (priority)

### WBNB ⇄ CAKE

```
Pair: WBNB/CAKE
Chain: 56 (BNB Chain)
Direction: WBNB → CAKE
Wallet network switch: MetaMask on BSC
Quote appears: [ ]
Commission shown: [ ] (expect 50 bps)
Minimum received shown: [ ]
Tx target is wrapper: [ ] (0x22B1FE0ba0E451707A675CC0AC19162A83E2c3a6)
No direct router bypass: [ ]
User rejected tx test: [ ]
Small dry-run: [ ] (~0.01 WBNB)
Normal dry-run: [ ] (~0.1 WBNB)
Unsupported reverse direction blocked or working: [ ] CAKE → WBNB
Verdict: [ ]
```

```
Pair: WBNB/CAKE
Chain: 56
Direction: CAKE → WBNB
Wallet network switch: [ ]
Quote appears: [ ]
Commission shown: [ ]
Minimum received shown: [ ]
Tx target is wrapper: [ ]
No direct router bypass: [ ]
User rejected tx test: [ ]
Small dry-run: [ ]
Normal dry-run: [ ]
Verdict: [ ]
```

### WBNB ⇄ USDC

```
Pair: WBNB/USDC
Chain: 56
Direction: WBNB → USDC
Wallet network switch: [ ]
Quote appears: [ ]
Commission shown: [ ]
Minimum received shown: [ ]
Tx target is wrapper: [ ]
No direct router bypass: [ ]
User rejected tx test: [ ]
Small dry-run: [ ]
Normal dry-run: [ ]
Unsupported reverse direction blocked or working: [ ] USDC → WBNB
Verdict: [ ]
```

```
Pair: WBNB/USDC
Chain: 56
Direction: USDC → WBNB
Wallet network switch: [ ]
Quote appears: [ ]
Commission shown: [ ]
Minimum received shown: [ ]
Tx target is wrapper: [ ]
No direct router bypass: [ ]
User rejected tx test: [ ]
Small dry-run: [ ]
Normal dry-run: [ ]
Verdict: [ ]
```

### WBNB ⇄ ETH

```
Pair: WBNB/ETH
Chain: 56
Direction: WBNB → ETH
Wallet network switch: [ ]
Quote appears: [ ]
Commission shown: [ ]
Minimum received shown: [ ]
Tx target is wrapper: [ ]
No direct router bypass: [ ]
User rejected tx test: [ ]
Small dry-run: [ ]
Normal dry-run: [ ]
Unsupported reverse direction blocked or working: [ ] ETH → WBNB
Verdict: [ ]
```

```
Pair: WBNB/ETH
Chain: 56
Direction: ETH → WBNB
Wallet network switch: [ ]
Quote appears: [ ]
Commission shown: [ ]
Minimum received shown: [ ]
Tx target is wrapper: [ ]
No direct router bypass: [ ]
User rejected tx test: [ ]
Small dry-run: [ ]
Normal dry-run: [ ]
Verdict: [ ]
```

### WBNB ⇄ FDUSD

```
Pair: WBNB/FDUSD
Chain: 56
Direction: WBNB → FDUSD
Wallet network switch: [ ]
Quote appears: [ ]
Commission shown: [ ]
Minimum received shown: [ ]
Tx target is wrapper: [ ]
No direct router bypass: [ ]
User rejected tx test: [ ]
Small dry-run: [ ]
Normal dry-run: [ ]
Unsupported reverse direction blocked or working: [ ] FDUSD → WBNB
Verdict: [ ]
```

```
Pair: WBNB/FDUSD
Chain: 56
Direction: FDUSD → WBNB
Wallet network switch: [ ]
Quote appears: [ ]
Commission shown: [ ]
Minimum received shown: [ ]
Tx target is wrapper: [ ]
No direct router bypass: [ ]
User rejected tx test: [ ]
Small dry-run: [ ]
Normal dry-run: [ ]
Verdict: [ ]
```

---

## Re-verify after DAI address fix

### WETH ⇄ DAI

```
Pair: WETH/DAI
Chain: 1
Direction: WETH → DAI
Wallet network switch: MetaMask on Ethereum
Quote appears: [ ]
Commission shown: [ ] (expect 20 bps)
Minimum received shown: [ ]
Tx target is wrapper: [ ] (V3 multi-hop: 0xa7702Ce9267567fd811B39C886CdABeC6eB249fc)
No direct router bypass: [ ]
User rejected tx test: [ ]
Small dry-run: [ ]
Normal dry-run: [ ]
Unsupported reverse direction blocked or working: [ ] DAI → WETH
Verdict: [ ]
```

```
Pair: WETH/DAI
Chain: 1
Direction: DAI → WETH
Wallet network switch: [ ]
Quote appears: [ ]
Commission shown: [ ]
Minimum received shown: [ ]
Tx target is wrapper: [ ]
No direct router bypass: [ ]
User rejected tx test: [ ]
Small dry-run: [ ]
Normal dry-run: [ ]
Verdict: [ ]
```

---

## Regression spot-check (existing pairs)

Run one direction each on:

- [ ] WETH → USDC (ETH, V3)
- [ ] ETH → USDT (ETH native, V2)
- [ ] BNB → USDT (BSC native)
- [ ] WBNB → BTCB (BSC)
- [ ] WETH → SNX (ETH V3 multi-hop)
- [ ] WETH → PENDLE (ETH V3 multi-hop)

---

## Negative tests

- [ ] WETH → PEPE shows unsupported / blocked (not swap-ready)
- [ ] Polygon (137) selected — swap blocked or clearly unsupported in commission mode
- [ ] Wrong network — clear error, no silent quote
