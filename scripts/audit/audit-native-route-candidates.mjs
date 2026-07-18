#!/usr/bin/env node
/**
 * Read-only native-in commission route certification.
 *
 * For every listed ERC-20 on Ethereum / BNB Chain (excluding wrapped-native):
 * 1. quotes three native-input sizes through the deployed V2 wrapper;
 * 2. verifies the exact on-chain fee split;
 * 3. checks large-size unit output degradation against the small quote; and
 * 4. simulates the real native swap entrypoint with eth_call.
 *
 * No transaction is signed or broadcast. eth_call state changes are discarded.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const ethersHref = new URL('../../frontend/node_modules/ethers/lib.esm/index.js', import.meta.url).href;
const {
  Contract,
  Interface,
  JsonRpcProvider,
  Network,
  formatUnits,
  getAddress,
  parseUnits,
} = await import(ethersHref);

const TREASURY = '0x509Cfd32ce279E08010C143F90Cc1782a3520196';
const ETH_CALL_SENDER = '0x28C6c06298d514Db089934071355E5743bf21d60';
const BSC_CALL_SENDER = '0x8894E0a0c962CB723c1976a4421c95949bE2D4E3';
const ETH_RPC = process.env.ETH_RPC_URL || 'https://ethereum.publicnode.com';
const BSC_RPC = process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org';
const MAX_UNIT_DEGRADATION = 0.05;

const QUOTE_ABI = [
  {
    inputs: [
      { name: 'tokenIn', type: 'address' },
      { name: 'tokenOut', type: 'address' },
      { name: 'fee', type: 'uint24' },
      { name: 'amountIn', type: 'uint256' },
      { name: 'sqrtPriceLimitX96', type: 'uint160' },
    ],
    name: 'quoteExactInputSingleERC20',
    outputs: [
      { name: 'amountOutGross', type: 'uint256' },
      { name: 'feeAmount', type: 'uint256' },
      { name: 'amountOutNet', type: 'uint256' },
      { name: 'sqrtPriceX96After', type: 'uint160' },
      { name: 'initializedTicksCrossed', type: 'uint32' },
      { name: 'gasEstimate', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
];

const NATIVE_SWAP_ABI = [
  {
    inputs: [
      { name: 'tokenOut', type: 'address' },
      { name: 'fee', type: 'uint24' },
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMinNet', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'sqrtPriceLimitX96', type: 'uint160' },
    ],
    name: 'swapExactInputSingleEthForTokens',
    outputs: [
      { name: 'amountOutGross', type: 'uint256' },
      { name: 'feeAmount', type: 'uint256' },
      { name: 'amountOutNet', type: 'uint256' },
    ],
    stateMutability: 'payable',
    type: 'function',
  },
];

const CHAINS = {
  1: {
    chainId: 1,
    label: 'Ethereum',
    native: 'ETH',
    wrapped: 'WETH',
    tokenFile: 'ethereum.json',
    wrapperEnv: 'VITE_UNISWAP_WRAPPER_V2_ADDRESS',
    feeBps: 20,
    feeTiers: [100, 500, 3000, 10_000],
    amounts: ['0.001', '0.01', '0.1'],
    simulationAmount: '0.01',
    rpc: ETH_RPC,
    sender: ETH_CALL_SENDER,
  },
  56: {
    chainId: 56,
    label: 'BNB Chain',
    native: 'BNB',
    wrapped: 'WBNB',
    tokenFile: 'bsc.json',
    wrapperEnv: 'VITE_PANCAKE_WRAPPER_V2_ADDRESS',
    feeBps: 50,
    feeTiers: [100, 500, 2500, 10_000],
    amounts: ['0.01', '0.1', '1'],
    simulationAmount: '0.1',
    rpc: BSC_RPC,
    sender: BSC_CALL_SENDER,
  },
};

const POLICY_BLOCKED = new Set(['1|ETH|PEPE']);

function normalizeAddress(address) {
  return getAddress(String(address).toLowerCase());
}

function loadEnv() {
  const env = {};
  const text = fs.readFileSync(path.join(ROOT, 'frontend/.env.production'), 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const split = trimmed.indexOf('=');
    if (split < 0) continue;
    env[trimmed.slice(0, split).trim()] = trimmed.slice(split + 1).trim();
  }
  return env;
}

function loadTokens(file) {
  const parsed = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'frontend/src/tokens', file), 'utf8'),
  );
  return parsed.tokens;
}

function feeIsExact(gross, fee, feeBps) {
  return fee === (gross * BigInt(feeBps)) / 10_000n;
}

async function bestQuote(contract, cfg, wrappedAddress, token, amount) {
  const amountIn = parseUnits(amount, 18);
  let lastError;
  for (const feeTier of cfg.feeTiers) {
    try {
      const result = await contract.quoteExactInputSingleERC20.staticCall(
        wrappedAddress,
        normalizeAddress(token.address),
        feeTier,
        amountIn,
        0n,
      );
      return {
        feeTier,
        amountIn,
        gross: result[0],
        fee: result[1],
        net: result[2],
        initializedTicksCrossed: Number(result[4]),
        gasEstimate: result[5].toString(),
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('No pool quote');
}

async function simulateNativeSwap(provider, wrapper, cfg, token, quote, blockTimestamp) {
  const iface = new Interface(NATIVE_SWAP_ABI);
  const minNet = (quote.net * 99n) / 100n;
  const data = iface.encodeFunctionData('swapExactInputSingleEthForTokens', [
    normalizeAddress(token.address),
    quote.feeTier,
    quote.amountIn,
    minNet,
    BigInt(blockTimestamp + 1200),
    0n,
  ]);
  const raw = await provider.call({
    from: cfg.sender,
    to: wrapper,
    data,
    value: quote.amountIn,
  });
  const decoded = iface.decodeFunctionResult('swapExactInputSingleEthForTokens', raw);
  return { gross: decoded[0], fee: decoded[1], net: decoded[2] };
}

function errorText(error) {
  const data =
    error?.data ||
    error?.info?.error?.data ||
    error?.error?.data ||
    error?.cause?.data ||
    '';
  const text = error?.shortMessage || error?.reason || error?.message || String(error);
  return `${text}${data ? ` data=${String(data)}` : ''}`.slice(0, 800);
}

async function auditChain(cfg, env) {
  const network = Network.from(cfg.chainId);
  const provider = new JsonRpcProvider(cfg.rpc, network, { staticNetwork: network });
  const wrapper = getAddress(env[cfg.wrapperEnv]);
  const quoteContract = new Contract(wrapper, QUOTE_ABI, provider);
  const tokens = loadTokens(cfg.tokenFile);
  const wrappedToken = tokens.find((token) => token.symbol.toUpperCase() === cfg.wrapped);
  if (!wrappedToken) throw new Error(`Missing ${cfg.wrapped} in ${cfg.tokenFile}`);

  const code = await provider.getCode(wrapper);
  const treasuryContract = new Contract(
    wrapper,
    ['function treasury() view returns (address)', 'function feeBps() view returns (uint16)', 'function paused() view returns (bool)'],
    provider,
  );
  const [treasury, feeBps, paused, block] = await Promise.all([
    treasuryContract.treasury(),
    treasuryContract.feeBps(),
    treasuryContract.paused(),
    provider.getBlock('latest'),
  ]);
  if (code === '0x') throw new Error(`No code at ${wrapper}`);
  if (getAddress(treasury) !== getAddress(TREASURY)) throw new Error(`Treasury mismatch on ${cfg.label}`);
  if (Number(feeBps) !== cfg.feeBps) throw new Error(`feeBps mismatch on ${cfg.label}`);
  if (paused) throw new Error(`${cfg.label} wrapper is paused`);
  if (!block) throw new Error(`Could not read latest ${cfg.label} block`);

  const rows = [];
  for (const token of tokens) {
    const symbol = token.symbol.toUpperCase();
    if (symbol === cfg.native || symbol === cfg.wrapped) continue;

    const key = `${cfg.chainId}|${cfg.native}|${symbol}`;
    if (POLICY_BLOCKED.has(key)) {
      rows.push({ key, status: 'POLICY_BLOCKED' });
      continue;
    }

    try {
      const quotes = [];
      for (const amount of cfg.amounts) {
        const quote = await bestQuote(quoteContract, cfg, wrappedToken.address, token, amount);
        quotes.push({
          amountIn: amount,
          amountOutGross: formatUnits(quote.gross, token.decimals),
          amountOutNet: formatUnits(quote.net, token.decimals),
          feeAmount: formatUnits(quote.fee, token.decimals),
          feeTier: quote.feeTier,
          feeExact: feeIsExact(quote.gross, quote.fee, cfg.feeBps),
          initializedTicksCrossed: quote.initializedTicksCrossed,
          gasEstimate: quote.gasEstimate,
          raw: quote,
        });
      }

      const smallRate = Number(quotes[0].amountOutNet) / Number(quotes[0].amountIn);
      const largeRate = Number(quotes[2].amountOutNet) / Number(quotes[2].amountIn);
      const unitDegradation = Math.max(0, 1 - largeRate / smallRate);
      const simulationQuote = quotes.find((row) => row.amountIn === cfg.simulationAmount)?.raw;
      if (!simulationQuote) throw new Error('Missing simulation quote');
      const simulation = await simulateNativeSwap(
        provider,
        wrapper,
        cfg,
        token,
        simulationQuote,
        block.timestamp,
      );

      const feeExact =
        quotes.every((row) => row.feeExact) &&
        feeIsExact(simulation.gross, simulation.fee, cfg.feeBps);
      const simulationPass = simulation.net > 0n && simulation.fee > 0n;
      const liquidityPass = Number.isFinite(unitDegradation) && unitDegradation <= MAX_UNIT_DEGRADATION;
      const certified = feeExact && simulationPass && liquidityPass;

      rows.push({
        key,
        chainId: cfg.chainId,
        fromSymbol: cfg.native,
        toSymbol: symbol,
        wrapper,
        feeBps: cfg.feeBps,
        status: certified ? 'CERTIFIED' : 'REJECTED',
        feeExact,
        simulationPass,
        liquidityPass,
        unitDegradationPct: Number((unitDegradation * 100).toFixed(4)),
        simulation: {
          amountIn: cfg.simulationAmount,
          amountOutGross: formatUnits(simulation.gross, token.decimals),
          feeAmount: formatUnits(simulation.fee, token.decimals),
          amountOutNet: formatUnits(simulation.net, token.decimals),
          ethCallFrom: cfg.sender,
        },
        quotes: quotes.map(({ raw: _raw, ...quote }) => quote),
      });
    } catch (error) {
      rows.push({
        key,
        chainId: cfg.chainId,
        fromSymbol: cfg.native,
        toSymbol: symbol,
        wrapper,
        feeBps: cfg.feeBps,
        status: 'REJECTED',
        error: errorText(error),
      });
    }
  }

  return {
    chainId: cfg.chainId,
    chain: cfg.label,
    wrapper,
    treasury: getAddress(treasury),
    feeBps: Number(feeBps),
    paused,
    maxUnitDegradationPct: MAX_UNIT_DEGRADATION * 100,
    rows,
  };
}

async function main() {
  const env = loadEnv();
  if (env.VITE_COMMISSION_REQUIRED !== 'true') {
    throw new Error('VITE_COMMISSION_REQUIRED must be true');
  }

  const chains = [];
  for (const cfg of Object.values(CHAINS)) {
    chains.push(await auditChain(cfg, env));
  }

  const rows = chains.flatMap((chain) => chain.rows);
  const certifiedDirectionalKeys = rows
    .filter((row) => row.status === 'CERTIFIED')
    .map((row) => row.key)
    .sort();
  const rejectedDirectionalKeys = rows
    .filter((row) => row.status === 'REJECTED')
    .map((row) => row.key)
    .sort();

  const report = {
    auditedAt: new Date().toISOString(),
    method: 'wrapper quotes at three sizes + exact fee math + native swap eth_call simulation',
    noTransactionsBroadcast: true,
    commissionRequired: true,
    chains,
    summary: {
      candidateCount: rows.length,
      certifiedCount: certifiedDirectionalKeys.length,
      rejectedCount: rejectedDirectionalKeys.length,
      policyBlockedCount: rows.filter((row) => row.status === 'POLICY_BLOCKED').length,
      certifiedDirectionalKeys,
      rejectedDirectionalKeys,
    },
  };

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const reportPath = path.join(ROOT, 'reports', `native-route-candidate-audit-${stamp}.json`);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log(`Report: ${reportPath}`);
  console.log(`CERTIFIED: ${report.summary.certifiedCount}`);
  console.log(`REJECTED: ${report.summary.rejectedCount}`);
  console.log(`POLICY_BLOCKED: ${report.summary.policyBlockedCount}`);
  for (const row of rows) {
    console.log(
      `${row.status.padEnd(14)} ${row.key.padEnd(18)} impact=${row.unitDegradationPct ?? '-'}% ${row.error ?? ''}`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
