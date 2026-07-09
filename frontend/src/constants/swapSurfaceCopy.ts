/**
 * Glossary parity: shared user-facing strings for swap card, preview, history, activity, and errors.
 * Copy only — no runtime behavior.
 */
export const SWAP_SURFACE_COPY = {
  /**
   * @deprecated P4.3 — Trust consolidated into `swapCardTrustCompact` + footer; do not add new call sites.
   * Kept for glossary / external references only.
   */
  firstVisitTrustLine:
    'You sign every swap in your wallet. Settlement is final on-chain.',

  trustLineQuoteEstimate:
    'Amounts reflect this quote (estimate). Final tokens received are confirmed on-chain.',

  /** P4A — user-facing Swaperex wrapper fee label (not pool / route cost). */
  swaperexFeeLabel: 'Swaperex fee',
  swaperexFeeTooltip:
    'This fee is applied by the Swaperex wrapper and supports platform operations. The quoted receive amount is already net of this fee.',

  /** Swap card / preview: 1inch path — aggregator route cost (not Swaperex fee unless separately shown). */
  feeRouteCostLabel: 'Route cost',

  /** Swap card / preview: direct DEX pool fee tier (Uniswap / Pancake path). */
  feePoolCostLabel: 'Pool fee',

  /** Primary CTA when a quote must be re-fetched */
  refreshQuoteCta: 'Refresh quote',

  /** Primary CTA when allowance RPC failed (Uniswap / wrapper paths only) */
  allowanceCheckUncertainCta: 'Refresh quote',

  /** Short inline hint on the swap card when allowance read failed */
  allowanceCheckUncertainHint:
    'Could not verify token allowance from the network. Tap refresh to try again — do not approve unless the next quote still asks for approval.',

  /** Toast when auto-refreshing quote due to uncertain allowance */
  allowanceCheckUncertainToast: 'Fetching a new quote to verify your allowance…',

  /** Shown under wrapper fee % when on-chain FEE_BPS could not be read (RPC / contract) */
  wrapperFeeUnverifiedNote:
    'Could not confirm wrapper fee on-chain; showing the configured app value. Refresh or retry if this persists.',

  /** Quote fetch in progress (card output + primary button) */
  gettingQuote: 'Getting quote...',

  /** ETH native Phase 2: quote shown, wrapper execution flag off */
  quoteOnlyNoExecutionCta: 'Quote only — execution disabled',

  /** Primary CTA when the last quote request failed (no executable quote) */
  quoteFailedCta: 'Quote failed — try again',

  /** Commission-required mode: pair cannot be quoted via Swaperex wrapper routing (P4.1-A). */
  unsupportedCommissionRouteTitle:
    'This pair is not supported by Swaperex commission routing yet.',
  unsupportedCommissionRouteHelper:
    'Swaperex only enables pairs that can route through its commission wrapper. Try WETH ⇄ USDC, WETH ⇄ USDT, ETH ⇄ USDC, or ETH ⇄ USDT.',
  /** P9.2 — audited catalog pair when a live wrapper quote could not be fetched (display-only). */
  auditedCommissionQuoteFailedTitle:
    'Live wrapper quote unavailable for this pair.',
  auditedCommissionQuoteFailedHelper:
    'This direction is in the Swaperex audit catalog. Final quotes depend on live liquidity and network conditions — refresh or try again shortly.',
  auditedCommissionQuoteFailedNativeEthHelper:
    'This direction is in the Swaperex audit catalog. Native ETH routes through WETH inside the wrapper — refresh or try WETH if the quote keeps failing.',
  /** One-line majors hint under the unsupported commission panel (P4.1-B). */
  unsupportedCommissionRouteQuickTokensEthereum:
    'Quick picks on Ethereum: WETH ⇄ USDC, WETH ⇄ USDT, ETH ⇄ USDC, ETH ⇄ USDT — then search for anything else.',
  /** P2.1 — native ↔ wrapped on swap card (display-only; no wrap execution). */
  nativeWrappedPairRouteHelperEth:
    'ETH ↔ WETH is a wrap/unwrap action, not a normal DEX swap route. Dedicated wrap support is not enabled here yet.',
  nativeWrappedPairRouteHelperBsc:
    'BNB ↔ WBNB is a wrap/unwrap action, not a normal DEX swap route. Dedicated wrap support is not enabled here yet.',
  unsupportedCommissionRouteQuickTokensBsc:
    'Quick picks on BNB Chain: BNB, WBNB, USDT, USDC, BTCB — then search for anything else.',
  unsupportedCommissionRouteQuickTokensDefault:
    'Try well-known majors on this network first, then search for other tokens.',
  unsupportedCommissionRouteCta: 'Choose another token',

  /** P1 recovery — proactive panel + compact chips for blocked/unsupported commission pairs. */
  commissionRouteRecoveryHelper:
    'Pick an audited commission route below to pre-fill pay and receive tokens.',
  commissionRouteRecoveryChipsLabel: 'Audited commission routes',

  /** P3.3 — soft precheck when audit shows pair is not commission-ready yet. */
  commissionRoutingNotReadyYet:
    'Not yet supported by Swaperex commission routing. Quote may fail until this pair is enabled on the wrapper.',

  /** P3.1 — popular audited commission route shortcuts */
  popularCommissionRoutesTitle: 'Popular commission routes',
  auditedCommissionRouteBadge: 'Audited commission route',
  popularCommissionRoutesHint:
    'These pairs passed a live wrapper quote audit. Pick one to pre-fill pay and receive tokens.',

  /** P4A — always-visible featured pairs on swap card */
  featuredCommissionRoutesTitle: 'Featured pairs',
  featuredCommissionRoutesLabel: 'Featured audited commission routes',
  featuredCommissionRoutesHint: 'High-liquidity · Audited',
  featuredRoutesSwitchNetworkHint:
    'Swaps run on Ethereum and BNB Chain. Switch network to use routes on {network}.',

  /** P4A — commission swap unavailable on balance-view networks */
  commissionSwapUnavailableTitle: 'Swaps not available on this network',
  commissionSwapUnavailableBody:
    'Swaps with Swaperex commission are available on Ethereum and BNB Chain only. {network} is available for balance viewing, not swaps.',

  /** Primary CTA when the last on-chain swap attempt failed (quote may still be present) */
  swapFailedCta: 'Swap failed — try again',

  /** In-flight quote refresh (countdown chip / modal) */
  refreshing: 'Refreshing…',

  /** Background re-quote while the last good quote stays visible (Phase 2 — secondary, not primary chip) */
  refreshingQuoteSubtle: 'Refreshing quote…',

  quoteExpiredTitle: 'Quote expired',

  /** Single action label when TTL elapsed (swap card chip) */
  quoteExpiredChip: 'Quote expired · Refresh quote',

  /** Row label for aggregator / execution source */
  routeViaLabel: 'Route via',

  /** Quote API / store messaging */
  quoteExpiredDetail:
    'Quote expired (over 30 seconds old). Refresh quote to update the price.',

  /** Modal suggestion when execution failed due to stale quote */
  quoteExpiredSuggestion: 'Refresh quote, then confirm again.',

  /** Countdown tooltip (swap card) */
  quoteTtlTooltip: 'Quote TTL is 30s — refresh quote if you waited',

  /** Local history / activity success footers */
  minimumReceivedExactFooter:
    'Exact received: confirm in your wallet or on the explorer.',

  confirmedOnChainNoExact:
    'Confirmed on-chain. Exact received is not shown here — confirm in your wallet or on the explorer.',

  /** Success modal — single line under from/to summary */
  successQuoteBasisLine: 'Amounts are from the quote you signed (not decoded from the chain).',

  /** Success modal — compact on-chain disclaimer */
  successSettlementHint:
    'Settlement is final on-chain — verify exact balances in your wallet or the explorer.',

  /** Pre-sign confidence block (preview modal) */
  reviewBeforeSignTitle: 'Review before you sign',
  networkLabel: 'Network',
  quoteFreshnessLabel: 'Quote freshness',
  /** User setting: Best price vs fixed 1inch / Uniswap / Pancake */
  routePreferenceLabel: 'Route preference',
  routeExecutionLabel: 'Executes via',
  minimumReceivedLabel: 'Minimum received',
  slippageToleranceLabel: 'Slippage tolerance',
  gasLimitEstimateLabel: 'Est. gas (units)',
  /** We do not show a native-token fee estimate unless the wallet provides it at signing */
  networkFeeWalletFallback: 'Network fee is shown in your wallet before confirmation.',
  quoteFreshnessStale: 'Stale — refresh quote',

  /** Global footer — one short line; details live in Learn More / legal pages */
  footerTrustCompact:
    'Non-custodial swap interface — you sign every transaction in your wallet.',

  /** P5.1 — Markets screener error states */
  screenerDataUnavailable:
    'Market data is temporarily unavailable. Prices may be cached or missing — retry shortly.',
  screenerEmptyHonest:
    'No tokens match the current filters on this network. Try another chain or reset filters.',

  /** P5.1 — External provider degradation (display-only) */
  coingeckoUnavailable: 'CoinGecko market data is temporarily unavailable.',
  goplusUnavailable: 'Token safety data (GoPlus) is temporarily unavailable.',
  tokenSafetyUnavailable: 'Token safety check unavailable — verify the contract before swapping.',
  backendHealthDegraded: 'Some services are degraded — core swaps may still work.',

  /** @deprecated Use footerTrustCompact in layout */
  footerTrustNonCustodial:
    'Non-custodial: tokens stay in your wallet until you approve a transaction.',
  /** @deprecated Use footerTrustCompact */
  footerTrustLocalSigning: 'Transactions are signed locally in your wallet — Swaperex never receives your keys.',
  /** @deprecated Use footerTrustCompact */
  footerTrustWrapperFee:
    'Wrapper routes may include a small protocol fee taken from output on-chain; quoted receive amounts are already net where applicable.',

  /** Swap preview: one line under wrapper fee rows (replaces repeated “not gas” paragraphs) */
  previewWrapperNetFeeNote:
    'Swaperex fee is not gas. Expected / minimum received are net of the wrapper fee where applicable.',

  /** Slightly shorter modal trust strip */
  trustLineQuoteEstimateShort:
    'Amounts are from this quote (estimate). Final settlement is on-chain.',

  /** Calmer title when risk is routing/liquidity only (not unverified contract) */
  tokenSafetyTitleInfo: 'Route & liquidity',
  tokenSafetyTitleCaution: 'Verify before you swap',

  /** Micro copy under swap card primary trust (timing / signing reminder only). */
  swapCardTrustMicroLine:
    'Confirm amounts in your wallet before signing — quotes expire in ~30s.',

  /** Ethereum mainnet — native ETH selected (display-only; does not affect approval logic). */
  ethNativeHelper:
    'ETH is native gas asset. No token approval is needed for ETH itself.',

  /** Ethereum mainnet — WETH selected (display-only). */
  wethHelper:
    'WETH is wrapped ETH, an ERC-20 token. It may require approval before swapping.',

  /** Preview modal — approving / swapping steps */
  walletInProgressGuidance:
    'Wallet request is open. Complete or reject it in your wallet before clicking again.',

  /**
   * Single primary trust line on the swap card (P4.3): signing, settlement, custody.
   * Detail (wrapper output fees) stays in `quoteFeesFootnote` + preview rows where relevant.
   */
  swapCardTrustCompact:
    'You sign every swap in your wallet; settlement is final on-chain. Non-custodial — Swaperex never has your keys.',

  /** Muted footnote under grouped rate & fee rows on the swap card */
  quoteFeesFootnote:
    'Pool and route costs are in the DEX path. Swaperex fees (when shown) come from gross output on-chain — quoted receive is already net.',

  /** Primary CTA when commission swaps are unavailable on the active chain */
  commissionSwapSwitchNetworkCta: 'Switch to swap network',

  /** Success modal — protocol fee parentheticals */
  successFeeOnChainTreasury: '(on-chain, sent to treasury)',
  successFeeEstimated: '(estimated)',
  successFeeEstimatedFromOnChainNet: '(estimated from on-chain received amount)',

  /** Activity / history — route context (display-only; does not change stored records) */
  activityCommissionRouteLabel: 'Commission route',
  activityHistoricalRouteLabel: 'Historical route — before commission-required mode',

  /** Sidebar token list — RPC / balance fetch failed (wallet still connected) */
  tokenListBalancesUnavailable: (networkName: string) =>
    `Balances unavailable for ${networkName}. Swaps can still work — refresh or try again.`,

  /** Sidebar — fetch error with no cached rows (full read failure) */
  tokenListNetworkIssueTitle: 'Network issue',
  tokenListNetworkIssueDetail:
    'Could not refresh balances. Your wallet and swaps are unaffected — try again shortly.',
} as const;
