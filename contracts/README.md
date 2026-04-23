# SwaperexUniswapV3FeeWrapper (Foundry)

Non-upgradeable v1 wrapper: **Ethereum mainnet**, **Uniswap V3 `SwapRouter02`**, **ERC20→ERC20**, **output-side fee** (see `src/SwaperexUniswapV3FeeWrapper.sol`).

## Toolchain

Install [Foundry](https://book.getfoundry.sh/getting-started/installation), then dependencies:

```bash
cd contracts
forge install OpenZeppelin/openzeppelin-contracts@v5.0.2 foundry-rs/forge-std@v1.9.4
```

(Already present under `lib/` if you cloned a tree that includes vendored libs.)

## Validation

```bash
cd contracts
forge fmt --check
forge build
forge test
```

**Quoting:** `quoteExactInputSingleERC20` is not a Solidity `view` function because Uniswap **QuoterV2** must be invoked with a normal `CALL` (same as top-level `eth_call` off-chain). A `STATICCALL` to QuoterV2 breaks the internal `pool.swap` simulation.

Fork tests (`SwaperexUniswapV3FeeWrapper.fork.t.sol`) **skip** unless `MAINNET_RPC_URL` is set to a working Ethereum JSON-RPC endpoint:

```bash
export MAINNET_RPC_URL="https://…"   # your node / Alchemy / Infura
forge test --match-contract Fork -vv
```

CI without an RPC can run:

```bash
forge test --no-match-contract Fork
```

## Constructor arguments (mainnet)

Deploy `SwaperexUniswapV3FeeWrapper` with:

| # | Argument        | Source | Mainnet value |
|---|-----------------|--------|----------------|
| 1 | `router_`       | Fixed in `script/DeployUniswapWrapper.s.sol` | `0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45` (`SwapRouter02`) |
| 2 | `quoter_`       | Fixed in script | `0x61fFE014bA17989E743c5F6cB21bF9697530B21e` (`QuoterV2`) |
| 3 | `feeRecipient_` | **Env `FEE_RECIPIENT`** (required) | Swaperex treasury (multisig), checksummed `0x…` |
| 4 | `feeBps_`       | **Env `FEE_BPS`** (required) | `1 … 1000` (must match product; on-chain cap is `MAX_FEE_BPS = 1000`) |

## Deploy (mainnet)

**Env (broadcast):**

- `FEE_RECIPIENT` — treasury address (constructor arg 3).
- `FEE_BPS` — e.g. `50` for 0.5%.
- `MAINNET_RPC_URL` — JSON-RPC for `--rpc-url`.
- **Signer:** for `--broadcast`, pass a Foundry-supported signer flag (e.g. `--private-key $DEPLOYER_PRIVATE_KEY`, `--ledger`, `--aws`). `vm.startBroadcast()` is used without an explicit wallet in-script.

**Simulate (no tx):**

```bash
cd contracts
export MAINNET_RPC_URL="https://…"
export FEE_RECIPIENT="0x…"   # treasury
export FEE_BPS="50"
forge script script/DeployUniswapWrapper.s.sol:DeployUniswapWrapper \
  --rpc-url "$MAINNET_RPC_URL" \
  -vvvv
```

**Broadcast:**

```bash
cd contracts
forge script script/DeployUniswapWrapper.s.sol:DeployUniswapWrapper \
  --rpc-url "$MAINNET_RPC_URL" \
  --broadcast \
  --slow \
  --private-key "$DEPLOYER_PRIVATE_KEY" \
  -vvvv
```

Copy `SwaperexUniswapV3FeeWrapper:` address from the logs (and from `broadcast/` JSON if present). For a **multisig** deploy, run the **simulate** step only here, then deploy the same bytecode + constructor args via your Safe / deployment UI instead of `--private-key`.

**Verify on Etherscan** (replace `<DEPLOYED>` and match the same `FEE_*` as deploy):

```bash
cd contracts
forge verify-contract "<DEPLOYED>" \
  src/SwaperexUniswapV3FeeWrapper.sol:SwaperexUniswapV3FeeWrapper \
  --chain mainnet \
  --compiler-version 0.8.26 \
  --num-of-optimizations 200 \
  --via-ir \
  --constructor-args $(cast abi-encode "constructor(address,address,address,uint16)" \
    0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45 \
    0x61fFE014bA17989E743c5F6cB21bF9697530B21e \
    "$FEE_RECIPIENT" \
    "$FEE_BPS") \
  --etherscan-api-key "$ETHERSCAN_API_KEY" \
  --watch
```

If verification fails, confirm `solc`/`optimizer_runs`/`via_ir` match `foundry.toml` exactly.

**Post-deploy reads** (`<DEPLOYED>` = wrapper address):

```bash
export WRAPPER="<DEPLOYED>"
cast call "$WRAPPER" "ROUTER()(address)" --rpc-url "$MAINNET_RPC_URL"
cast call "$WRAPPER" "QUOTER()(address)" --rpc-url "$MAINNET_RPC_URL"
cast call "$WRAPPER" "FEE_RECIPIENT()(address)" --rpc-url "$MAINNET_RPC_URL"
cast call "$WRAPPER" "FEE_BPS()(uint16)" --rpc-url "$MAINNET_RPC_URL"
```

Compare outputs to your deploy manifest.

## Build notes

- `via_ir = true` is enabled in `foundry.toml` to avoid “stack too deep” in the swap function while keeping a single external entrypoint.
