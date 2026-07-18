#!/usr/bin/env node
/**
 * Bidirectional native-pair execution certification on local mainnet forks.
 *
 * Uses Anvil forks and its local test account only. No production transaction
 * is signed or broadcast. For each candidate previously certified by
 * audit-native-route-candidates.mjs:
 * - executes native -> ERC20 through the deployed wrapper;
 * - confirms treasury receives the exact output-side fee;
 * - approves the wrapper on the fork;
 * - executes ERC20 -> native; and
 * - confirms treasury receives the exact native fee.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const ethersHref = new URL('../../frontend/node_modules/ethers/lib.esm/index.js', import.meta.url).href;
const {
  Contract,
  JsonRpcProvider,
  NonceManager,
  Wallet,
  formatUnits,
  getAddress,
  parseUnits,
} = await import(ethersHref);

const LOCAL_ANVIL_PRIVATE_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const ETH_RPC = process.env.ETH_RPC_URL || 'https://ethereum.publicnode.com';
const BSC_RPC = process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org';
const TREASURY = getAddress('0x509Cfd32ce279E08010C143F90Cc1782a3520196');
const requestedKeys = new Set(
  (process.argv.find((arg) => arg.startsWith('--keys='))?.slice('--keys='.length) || '')
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean),
);

const WRAPPER_ABI = [
  'function quoteExactInputSingleERC20(address tokenIn,address tokenOut,uint24 fee,uint256 amountIn,uint160 sqrtPriceLimitX96) returns (uint256 amountOutGross,uint256 feeAmount,uint256 amountOutNet,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)',
  'function swapExactInputSingleEthForTokens(address tokenOut,uint24 fee,uint256 amountIn,uint256 amountOutMinNet,uint256 deadline,uint160 sqrtPriceLimitX96) payable returns (uint256 amountOutGross,uint256 feeAmount,uint256 amountOutNet)',
  'function swapExactInputSingleTokensForEth(address tokenIn,uint24 fee,uint256 amountIn,uint256 amountOutMinNet,uint256 deadline,uint160 sqrtPriceLimitX96) payable returns (uint256 amountOutGross,uint256 feeAmount,uint256 amountOutNet)',
  'function treasury() view returns (address)',
  'function feeBps() view returns (uint16)',
  'function paused() view returns (bool)',
];
const ERC20_ABI = [
  'function approve(address spender,uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
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
    amountIn: '0.01',
    rpc: ETH_RPC,
    port: 18545,
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
    amountIn: '0.1',
    rpc: BSC_RPC,
    port: 18546,
  },
};

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
  return new Map(parsed.tokens.map((token) => [token.symbol.toUpperCase(), token]));
}

function loadCandidateReport() {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const reportPath = path.join(ROOT, 'reports', `native-route-candidate-audit-${stamp}.json`);
  return { reportPath, report: JSON.parse(fs.readFileSync(reportPath, 'utf8')) };
}

async function waitForRpc(provider, process) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (process.exitCode != null) {
      throw new Error(`Anvil exited before RPC became ready (code ${process.exitCode})`);
    }
    try {
      await provider.getBlockNumber();
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error('Timed out waiting for Anvil fork RPC');
}

async function startFork(cfg) {
  const child = spawn(
    'anvil',
    [
      '--fork-url',
      cfg.rpc,
      '--port',
      String(cfg.port),
      '--chain-id',
      String(cfg.chainId),
      '--timeout',
      '30000',
      '--retries',
      '2',
      '--silent',
    ],
    { stdio: 'ignore' },
  );
  const provider = new JsonRpcProvider(`http://127.0.0.1:${cfg.port}`, cfg.chainId, {
    staticNetwork: true,
  });
  await waitForRpc(provider, child);
  return { child, provider };
}

async function bestQuote(wrapper, cfg, tokenIn, tokenOut, amountIn) {
  let lastError;
  for (const feeTier of cfg.feeTiers) {
    try {
      const result = await wrapper.quoteExactInputSingleERC20.staticCall(
        tokenIn,
        tokenOut,
        feeTier,
        amountIn,
        0n,
      );
      return {
        feeTier,
        gross: result[0],
        fee: result[1],
        net: result[2],
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('No quote');
}

function assertFee(gross, fee, expectedBps, label) {
  const expected = (gross * BigInt(expectedBps)) / 10_000n;
  if (fee !== expected || fee <= 0n) {
    throw new Error(`${label}: expected fee ${expected}, got ${fee}`);
  }
}

function errorText(error) {
  const data = error?.data || error?.info?.error?.data || error?.error?.data || '';
  const text = error?.shortMessage || error?.reason || error?.message || String(error);
  return `${text}${data ? ` data=${String(data)}` : ''}`.slice(0, 800);
}

async function certifyRoute({ cfg, provider, env, token }) {
  const wallet = new NonceManager(new Wallet(LOCAL_ANVIL_PRIVATE_KEY, provider));
  const user = await wallet.getAddress();
  const wrapperAddress = normalizeAddress(env[cfg.wrapperEnv]);
  const wrapper = new Contract(wrapperAddress, WRAPPER_ABI, wallet);
  const erc20 = new Contract(normalizeAddress(token.address), ERC20_ABI, wallet);
  const tokens = loadTokens(cfg.tokenFile);
  const wrapped = tokens.get(cfg.wrapped);
  if (!wrapped) throw new Error(`Missing ${cfg.wrapped}`);
  const wrappedAddress = normalizeAddress(wrapped.address);
  const tokenAddress = normalizeAddress(token.address);
  const amountIn = parseUnits(cfg.amountIn, 18);
  const latest = await provider.getBlock('latest');
  if (!latest) throw new Error('Missing latest block');
  const deadline = BigInt(latest.timestamp + 3600);

  const forwardQuote = await bestQuote(wrapper, cfg, wrappedAddress, tokenAddress, amountIn);
  assertFee(forwardQuote.gross, forwardQuote.fee, cfg.feeBps, 'forward quote');
  const forwardMin = (forwardQuote.net * 98n) / 100n;
  const forwardPreview = await wrapper.swapExactInputSingleEthForTokens.staticCall(
    tokenAddress,
    forwardQuote.feeTier,
    amountIn,
    forwardMin,
    deadline,
    0n,
    { value: amountIn },
  );
  assertFee(forwardPreview[0], forwardPreview[1], cfg.feeBps, 'forward execution preview');

  const treasuryTokenBefore = await erc20.balanceOf(TREASURY);
  const userTokenBefore = await erc20.balanceOf(user);
  const forwardTx = await wrapper.swapExactInputSingleEthForTokens(
    tokenAddress,
    forwardQuote.feeTier,
    amountIn,
    forwardMin,
    deadline,
    0n,
    { value: amountIn, gasLimit: 1_500_000n },
  );
  const forwardReceipt = await forwardTx.wait();
  if (!forwardReceipt || forwardReceipt.status !== 1) throw new Error('Forward fork transaction failed');
  const treasuryTokenAfter = await erc20.balanceOf(TREASURY);
  const userTokenAfter = await erc20.balanceOf(user);
  const treasuryTokenDelta = treasuryTokenAfter - treasuryTokenBefore;
  const userTokenDelta = userTokenAfter - userTokenBefore;
  if (treasuryTokenDelta !== forwardPreview[1]) {
    throw new Error(`Forward treasury fee mismatch: expected ${forwardPreview[1]}, got ${treasuryTokenDelta}`);
  }
  if (userTokenDelta !== forwardPreview[2]) {
    throw new Error(`Forward user net mismatch: expected ${forwardPreview[2]}, got ${userTokenDelta}`);
  }

  const reverseAmountIn = userTokenDelta / 2n;
  if (reverseAmountIn <= 0n) throw new Error('No token output available for reverse simulation');
  const approvalTx = await erc20.approve(wrapperAddress, reverseAmountIn);
  const approvalReceipt = await approvalTx.wait();
  if (!approvalReceipt || approvalReceipt.status !== 1) throw new Error('Fork approval failed');

  const reverseQuote = await bestQuote(wrapper, cfg, tokenAddress, wrappedAddress, reverseAmountIn);
  assertFee(reverseQuote.gross, reverseQuote.fee, cfg.feeBps, 'reverse quote');
  const reverseMin = (reverseQuote.net * 98n) / 100n;
  const reversePreview = await wrapper.swapExactInputSingleTokensForEth.staticCall(
    tokenAddress,
    reverseQuote.feeTier,
    reverseAmountIn,
    reverseMin,
    deadline,
    0n,
  );
  assertFee(reversePreview[0], reversePreview[1], cfg.feeBps, 'reverse execution preview');

  const reverseBeforeBlock = await provider.getBlockNumber();
  const treasuryNativeBefore = await provider.getBalance(TREASURY, reverseBeforeBlock);
  const reverseTx = await wrapper.swapExactInputSingleTokensForEth(
    tokenAddress,
    reverseQuote.feeTier,
    reverseAmountIn,
    reverseMin,
    deadline,
    0n,
    { gasLimit: 1_500_000n },
  );
  const reverseReceipt = await reverseTx.wait();
  if (!reverseReceipt || reverseReceipt.status !== 1) throw new Error('Reverse fork transaction failed');
  const treasuryNativeAfter = await provider.getBalance(TREASURY, reverseReceipt.blockNumber);
  const treasuryNativeDelta = treasuryNativeAfter - treasuryNativeBefore;
  if (treasuryNativeDelta !== reversePreview[1]) {
    throw new Error(`Reverse treasury fee mismatch: expected ${reversePreview[1]}, got ${treasuryNativeDelta}`);
  }

  return {
    forward: {
      direction: `${cfg.native}→${token.symbol}`,
      amountIn: cfg.amountIn,
      feeTier: forwardQuote.feeTier,
      feeAmount: formatUnits(forwardPreview[1], token.decimals),
      amountOutNet: formatUnits(forwardPreview[2], token.decimals),
      treasuryDelta: formatUnits(treasuryTokenDelta, token.decimals),
      txStatus: forwardReceipt.status,
    },
    reverse: {
      direction: `${token.symbol}→${cfg.native}`,
      amountIn: formatUnits(reverseAmountIn, token.decimals),
      feeTier: reverseQuote.feeTier,
      feeAmount: formatUnits(reversePreview[1], 18),
      amountOutNet: formatUnits(reversePreview[2], 18),
      treasuryDelta: formatUnits(treasuryNativeDelta, 18),
      txStatus: reverseReceipt.status,
    },
  };
}

async function auditChain(cfg, env, candidateRows) {
  const { child, provider } = await startFork(cfg);
  const tokens = loadTokens(cfg.tokenFile);
  const results = [];
  try {
    for (const candidate of candidateRows) {
      console.log(`FORK_EXEC_START ${candidate.key}`);
      const token = tokens.get(candidate.toSymbol);
      if (!token) {
        results.push({ key: candidate.key, status: 'REJECTED', error: 'Token missing from inventory' });
        continue;
      }
      const snapshot = await provider.send('evm_snapshot', []);
      try {
        const execution = await certifyRoute({ cfg, provider, env, token });
        results.push({
          key: candidate.key,
          reverseKey: `${cfg.chainId}|${candidate.toSymbol}|${cfg.native}`,
          status: 'CERTIFIED_BIDIRECTIONAL',
          execution,
        });
        console.log(`FORK_EXEC_PASS ${candidate.key}`);
      } catch (error) {
        results.push({ key: candidate.key, status: 'REJECTED', error: errorText(error) });
        console.log(`FORK_EXEC_REJECT ${candidate.key} ${errorText(error)}`);
      } finally {
        await provider.send('evm_revert', [snapshot]);
      }
    }
  } finally {
    child.kill('SIGTERM');
    await provider.destroy();
  }
  return { chainId: cfg.chainId, chain: cfg.label, results };
}

async function main() {
  const env = loadEnv();
  if (env.VITE_COMMISSION_REQUIRED !== 'true') {
    throw new Error('VITE_COMMISSION_REQUIRED must be true');
  }
  const { reportPath: candidateReportPath, report: candidateReport } = loadCandidateReport();
  const certifiedCandidates = candidateReport.chains
    .flatMap((chain) => chain.rows)
    .filter(
      (row) =>
        row.status === 'CERTIFIED' &&
        (requestedKeys.size === 0 || requestedKeys.has(row.key)),
    );

  const chains = [];
  for (const cfg of Object.values(CHAINS)) {
    const rows = certifiedCandidates.filter((row) => row.chainId === cfg.chainId);
    chains.push(await auditChain(cfg, env, rows));
  }

  const results = chains.flatMap((chain) => chain.results);
  const certified = results.filter((row) => row.status === 'CERTIFIED_BIDIRECTIONAL');
  const rejected = results.filter((row) => row.status === 'REJECTED');
  const certifiedDirectionalKeys = certified
    .flatMap((row) => [row.key, row.reverseKey])
    .sort();

  const report = {
    auditedAt: new Date().toISOString(),
    method: 'local Anvil mainnet-fork execution in both directions',
    candidateReport: candidateReportPath,
    noProductionTransactions: true,
    noProductionFundsUsed: true,
    chains,
    summary: {
      routeFamiliesCertified: certified.length,
      routeFamiliesRejected: rejected.length,
      certifiedDirectionalKeys,
    },
  };

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const requestedSuffix =
    requestedKeys.size > 0
      ? `-${[...requestedKeys].sort().join('_').replace(/[^A-Za-z0-9_-]+/g, '-')}`
      : '';
  const reportPath = path.join(
    ROOT,
    'reports',
    `native-route-fork-execution-${stamp}${requestedSuffix}.json`,
  );
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Report: ${reportPath}`);
  console.log(`CERTIFIED_BIDIRECTIONAL: ${certified.length}`);
  console.log(`REJECTED: ${rejected.length}`);
  for (const row of results) {
    console.log(`${row.status.padEnd(24)} ${row.key} ${row.error ?? ''}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
