import type { QuoteEconomics } from '@/utils/quoteEconomics';
import { isQuoteQualityExecutable } from '@/utils/quoteQuality';

export type QuoteSelectionReason =
  | 'only_executable_certified_route'
  | 'highest_effective_net_value'
  | 'highest_net_output'
  | 'fewer_hops'
  | 'fresher_quote'
  | 'deterministic_route_fingerprint';

export type CertifiedQuoteSelection = {
  selected: QuoteEconomics;
  candidatesConsidered: number;
  candidatesRejected: number;
  selectionReason: QuoteSelectionReason;
};

function compareBigIntDescending(a: bigint, b: bigint): number {
  return a === b ? 0 : a > b ? -1 : 1;
}

function compareCandidates(a: QuoteEconomics, b: QuoteEconomics): number {
  const hasComparableUsd =
    a.effectiveValueAfterGasUsdMicros != null &&
    b.effectiveValueAfterGasUsdMicros != null;
  if (hasComparableUsd) {
    const effective = compareBigIntDescending(
      a.effectiveValueAfterGasUsdMicros!,
      b.effectiveValueAfterGasUsdMicros!,
    );
    if (effective !== 0) return effective;
  } else {
    const output = compareBigIntDescending(a.netAmountOut, b.netAmountOut);
    if (output !== 0) return output;
  }

  if (a.hopCount !== b.hopCount) return a.hopCount - b.hopCount;
  if (a.quotedAt !== b.quotedAt) return b.quotedAt - a.quotedAt;
  return a.routeFingerprint.localeCompare(b.routeFingerprint);
}

function explainSelection(
  selected: QuoteEconomics,
  runnerUp: QuoteEconomics | undefined,
): QuoteSelectionReason {
  if (!runnerUp) return 'only_executable_certified_route';
  if (
    selected.effectiveValueAfterGasUsdMicros != null &&
    runnerUp.effectiveValueAfterGasUsdMicros != null &&
    selected.effectiveValueAfterGasUsdMicros !== runnerUp.effectiveValueAfterGasUsdMicros
  ) {
    return 'highest_effective_net_value';
  }
  if (selected.netAmountOut !== runnerUp.netAmountOut) return 'highest_net_output';
  if (selected.hopCount !== runnerUp.hopCount) return 'fewer_hops';
  if (selected.quotedAt !== runnerUp.quotedAt) return 'fresher_quote';
  return 'deterministic_route_fingerprint';
}

export function selectBestCertifiedQuote(
  candidates: readonly QuoteEconomics[],
  now = Date.now(),
): CertifiedQuoteSelection {
  const executable = candidates.filter((candidate) =>
    isQuoteQualityExecutable(candidate, now),
  );
  if (executable.length === 0) {
    throw new Error('No executable certified quote candidates');
  }

  const ranked = [...executable].sort(compareCandidates);
  const selected = ranked[0]!;
  return {
    selected,
    candidatesConsidered: ranked.length,
    candidatesRejected: candidates.length - ranked.length,
    selectionReason: explainSelection(selected, ranked[1]),
  };
}
