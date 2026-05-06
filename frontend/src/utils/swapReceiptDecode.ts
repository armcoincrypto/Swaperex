/**
 * Decode ERC-20 Transfer logs from a swap tx receipt (read-only, best-effort).
 * Used for on-chain settlement display and revenue hints — does not affect execution.
 */

import { getAddress, id, type Log } from 'ethers';

const ERC20_TRANSFER_TOPIC = id('Transfer(address,address,uint256)');
/** WETH9-style unwrap: `Withdrawal(address indexed src, uint256 wad)` — ETH is sent to `src`. */
const WETH_WITHDRAWAL_TOPIC = id('Withdrawal(address,uint256)');

function topicToAddress(topic: string): string {
  return getAddress(`0x${topic.slice(-40)}`);
}

export type DecodedOutputAndFee = {
  /** Net output token movement for the user (credits − debits). */
  userNetWei: bigint;
  /** Output token sent to treasury (fee), when identifiable. */
  feeToTreasuryWei: bigint;
};

/**
 * Sum Transfer(address,address,uint256) for `outputTokenAddress`:
 * - Net user balance change for that token
 * - Gross amount sent to `treasuryAddress` for that token
 */
export function decodeSwapOutputAndFeeFromLogs(
  logs: readonly Log[] | undefined,
  userAddress: string,
  treasuryAddress: string | null | undefined,
  outputTokenAddress: string,
): DecodedOutputAndFee | null {
  if (!logs?.length || !userAddress || !outputTokenAddress) return null;

  let user: string;
  try {
    user = getAddress(userAddress);
  } catch {
    return null;
  }

  let treasury: string | null = null;
  if (treasuryAddress) {
    try {
      treasury = getAddress(treasuryAddress);
    } catch {
      treasury = null;
    }
  }

  const outTok = outputTokenAddress.toLowerCase();
  let userNet = 0n;
  let feeWei = 0n;

  for (const log of logs) {
    if (!log.topics || log.topics.length !== 3) continue;
    if (log.topics[0] !== ERC20_TRANSFER_TOPIC) continue;
    if ((log.address || '').toLowerCase() !== outTok) continue;

    let from: string;
    let to: string;
    let value: bigint;
    try {
      from = topicToAddress(log.topics[1]);
      to = topicToAddress(log.topics[2]);
      value = BigInt(log.data);
    } catch {
      continue;
    }

    if (to.toLowerCase() === user.toLowerCase()) userNet += value;
    if (from.toLowerCase() === user.toLowerCase()) userNet -= value;
    if (treasury && to.toLowerCase() === treasury.toLowerCase()) feeWei += value;
  }

  if (userNet <= 0n) return null;
  return { userNetWei: userNet, feeToTreasuryWei: feeWei };
}

/**
 * Sum WETH `Withdrawal` logs where `src` is the user (unwrap → native ETH credited to that address).
 * Does not use debug_traceTransaction; plain contract→EOA ETH transfers without unwrap stay invisible here.
 */
export function decodeNativeEthReceivedWeiFromLogs(
  logs: readonly Log[] | undefined,
  userAddress: string,
  wethAddress: string,
): bigint {
  if (!logs?.length || !userAddress || !wethAddress) return 0n;

  let user: string;
  try {
    user = getAddress(userAddress);
  } catch {
    return 0n;
  }

  const weth = wethAddress.toLowerCase();
  let total = 0n;

  for (const log of logs) {
    if (!log.topics || log.topics.length !== 2) continue;
    if (log.topics[0] !== WETH_WITHDRAWAL_TOPIC) continue;
    if ((log.address || '').toLowerCase() !== weth) continue;
    try {
      const src = topicToAddress(log.topics[1]);
      if (src.toLowerCase() !== user.toLowerCase()) continue;
      total += BigInt(log.data);
    } catch {
      continue;
    }
  }

  return total;
}

/**
 * Native ETH output: prefer unwrap (`Withdrawal` on WETH), else net WETH ERC-20 to user.
 * Treasury fee is still read from WETH `Transfer` when the protocol takes fee in-kind on the output leg.
 */
export function decodeNativeEthOutputAndFeeFromLogs(
  logs: readonly Log[] | undefined,
  userAddress: string,
  treasuryAddress: string | null | undefined,
  wethAddress: string,
): DecodedOutputAndFee | null {
  const ethFromUnwrap = decodeNativeEthReceivedWeiFromLogs(logs, userAddress, wethAddress);
  const wethLeg = decodeSwapOutputAndFeeFromLogs(logs, userAddress, treasuryAddress, wethAddress);

  let userNet = ethFromUnwrap;
  if (userNet <= 0n && wethLeg && wethLeg.userNetWei > 0n) {
    userNet = wethLeg.userNetWei;
  }

  if (userNet <= 0n) return null;

  const feeWei = wethLeg?.feeToTreasuryWei ?? 0n;
  return { userNetWei: userNet, feeToTreasuryWei: feeWei };
}

