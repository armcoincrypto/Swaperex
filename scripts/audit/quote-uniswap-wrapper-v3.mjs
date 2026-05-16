#!/usr/bin/env node
/**
 * Read-only audit: Swaperex Uniswap V3 fee wrapper **V3** quotes on Ethereum mainnet.
 *
 * - Uses public RPC (override with ETH_RPC_URL).
 * - Calls wrapper `quoteExactInputERC20` via staticCall (no tx, no gas, no keys).
 * - Mirrors frontend path packing + fee tier try order (500, 3000, 100, 10000).
 * - Two-token canary WETH-USDC: tests both WETH→USDC and USDC→WETH (reverse path).
 *
 * Usage (from repo root):
 *   ETH_RPC_URL=https://ethereum.publicnode.com \
 *   VITE_UNISWAP_WRAPPER_V3_ADDRESS=0xa7702Ce9267567fd811B39C886CdABeC6eB249fc \
 *   node scripts/audit/quote-uniswap-wrapper-v3.mjs
 *
 * Optional: AMOUNT_WETH=0.01 AMOUNT_USDC=25
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const ethersHref = new URL('../../frontend/node_modules/ethers/lib.esm/index.js', import.meta.url).href;
const { Contract, JsonRpcProvider, Network, formatUnits, parseUnits, solidityPacked, Interface } =
  await import(ethersHref);

const CHAIN_ID = 1;
const RPC = process.env.ETH_RPC_URL || 'https://ethereum.publicnode.com';
const WRAPPER =
  process.env.VITE_UNISWAP_WRAPPER_V3_ADDRESS || '0xa7702Ce9267567fd811B39C886CdABeC6eB249fc';

const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

const FEE_TRY_ORDER = [500, 3000, 100, 10000];

const WRAPPER_V3_QUOTE_ABI = [
  {
    inputs: [
      { name: 'path', type: 'bytes' },
      { name: 'tokenIn', type: 'address' },
      { name: 'tokenOut', type: 'address' },
      { name: 'amountIn', type: 'uint256' },
    ],
    name: 'quoteExactInputERC20',
    outputs: [
      { name: 'amountOutGross', type: 'uint256' },
      { name: 'feeAmount', type: 'uint256' },
      { name: 'amountOutNet', type: 'uint256' },
      { name: '', type: 'uint160[]' },
      { name: '', type: 'uint32[]' },
      { name: 'gasEstimate', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
];

const WRAPPER_V3_SWAP_ABI = [
  {
    inputs: [
      { name: 'path', type: 'bytes' },
      { name: 'tokenIn', type: 'address' },
      { name: 'tokenOut', type: 'address' },
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMinNet', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
    name: 'swapExactInputERC20',
    outputs: [
      { name: 'amountOutGross', type: 'uint256' },
      { name: 'feeAmount', type: 'uint256' },
      { name: 'amountOutNet', type: 'uint256' },
    ],
    stateMutability: 'payable',
    type: 'function',
  },
];

function encodeV3Path(tokenAddresses, fees) {
  if (tokenAddresses.length < 2 || fees.length !== tokenAddresses.length - 1) {
    throw new Error('encodeV3Path: token/fee length mismatch');
  }
  const types = [];
  const vals = [];
  for (let i = 0; i < tokenAddresses.length; i++) {
    types.push('address');
    vals.push(tokenAddresses[i]);
    if (i < fees.length) {
      types.push('uint24');
      vals.push(BigInt(fees[i]));
    }
  }
  return solidityPacked(types, vals);
}

/** Same semantics as frontend `resolveUniswapWrapperV3CanarySymbolsForSwap` for WETH-USDC row. */
function resolveCanaryEndpoints(tokenInAddr, tokenOutAddr) {
  const a = tokenInAddr.toLowerCase();
  const b = tokenOutAddr.toLowerCase();
  if (a === WETH.toLowerCase() && b === USDC.toLowerCase()) return [WETH, USDC];
  if (a === USDC.toLowerCase() && b === WETH.toLowerCase()) return [USDC, WETH];
  throw new Error('This audit script only supports WETH↔USDC mainnet pair');
}

async function quoteDirection(provider, label, tokenIn, tokenOut, amountInHuman, inDecimals, outDecimals) {
  const addrs = resolveCanaryEndpoints(tokenIn, tokenOut);
  const hops = addrs.length - 1;
  const amountInWei = parseUnits(amountInHuman, inDecimals);
  const wrapper = new Contract(WRAPPER, WRAPPER_V3_QUOTE_ABI, provider);

  let lastErr;
  for (const fee of FEE_TRY_ORDER) {
    if (hops !== 1) throw new Error('only single-hop in this audit');
    const path = encodeV3Path(addrs, [fee]);
    try {
      const result = await wrapper.quoteExactInputERC20.staticCall(
        path,
        addrs[0],
        addrs[addrs.length - 1],
        amountInWei,
      );
      const amountOutGross = result[0];
      const feeAmount = result[1];
      const amountOutNet = result[2];
      const gasEstimate = result[5];

      const iface = new Interface(WRAPPER_V3_SWAP_ABI);
      const minNet = (amountOutNet * 99n) / 100n;
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
      const swapData = iface.encodeFunctionData('swapExactInputERC20', [
        path,
        addrs[0],
        addrs[addrs.length - 1],
        amountInWei,
        minNet,
        deadline,
      ]);

      console.log(`\n=== ${label} ===`);
      console.log(`provider: uniswap-v3-wrapper-v3 (audit label — matches production AggregatedQuote.provider)`);
      console.log(`wrapper_address: ${WRAPPER}`);
      console.log(`tokenIn: ${addrs[0]}`);
      console.log(`tokenOut: ${addrs[addrs.length - 1]}`);
      console.log(`path (0x hex): ${path}`);
      console.log(`hopCount: ${hops}`);
      console.log(`fee_tiers_tried_success: ${fee}`);
      console.log(`amountIn: ${amountInHuman} (${amountInWei} wei, ${inDecimals} dp)`);
      console.log(`amountOutGross: ${amountOutGross} wei → ${formatUnits(amountOutGross, outDecimals)} (out token)`);
      console.log(`feeAmount:      ${feeAmount} wei → ${formatUnits(feeAmount, outDecimals)}`);
      console.log(`amountOutNet:   ${amountOutNet} wei → ${formatUnits(amountOutNet, outDecimals)}`);
      console.log(`gasEstimate:    ${gasEstimate}`);
      console.log(
        `[calldata sanity] swapExactInputERC20 selector+encoded length: ${swapData.length} chars (not broadcast)`,
      );
      return { path, fee, amountOutGross, feeAmount, amountOutNet, swapData };
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`${label}: no working fee tier: ${lastErr?.message || lastErr}`);
}

async function main() {
  const net = Network.from(CHAIN_ID);
  const provider = new JsonRpcProvider(RPC, net, { staticNetwork: net });

  const amountWeth = process.env.AMOUNT_WETH || '0.01';
  const amountUsdc = process.env.AMOUNT_USDC || '25';

  console.log(`read_only_quote_audit repo_root=${REPO_ROOT}`);
  console.log(`rpc=${RPC}`);
  console.log(`chainId=${CHAIN_ID}`);

  await quoteDirection(provider, 'WETH → USDC', WETH, USDC, amountWeth, 18, 6);
  await quoteDirection(provider, 'USDC → WETH', USDC, WETH, amountUsdc, 6, 18);

  console.log('\n=== summary ===');
  console.log('OK: both directions quoted via quoteExactInputERC20.staticCall (no tx sent).');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
