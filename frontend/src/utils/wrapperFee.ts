/**
 * Estimate protocol fee (output token wei) from quoted **net** output and wrapper fee bps.
 * Matches on-chain `FeeMath`: fee on gross, user receives net.
 */
export function estimateWrapperFeeWeiFromNetOutput(amountOutNetWei: bigint, feeBps: number): bigint {
  if (feeBps <= 0 || feeBps >= 10_000 || amountOutNetWei <= 0n) return 0n;
  const bps = BigInt(feeBps);
  const gross = (amountOutNetWei * 10_000n) / (10_000n - bps);
  return gross - amountOutNetWei;
}
