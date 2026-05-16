/**
 * P4 — Landing FAQ copy shared by `DexFaqSection` and JSON-LD `FAQPage`.
 * Plain text only; keep in sync with on-page answers.
 */

export type KobbexDexFaqItem = {
  readonly question: string;
  /** Plain-text answer for schema.org and visible copy. */
  readonly answer: string;
};

export const KOBBEX_DEX_LANDING_FAQ: readonly KobbexDexFaqItem[] = [
  {
    question: 'What is Kobbex DEX?',
    answer:
      'Kobbex DEX is a non-custodial interface for swapping tokens on supported EVM networks. You connect your own wallet, request quotes, and sign transactions yourself; settlement happens on-chain.',
  },
  {
    question: 'Does Kobbex DEX custody my tokens?',
    answer:
      'No. The interface does not hold your private keys or take custody of your funds. Tokens move only when you sign an approval or swap transaction in your wallet.',
  },
  {
    question: 'How are swap routes chosen?',
    answer:
      'Quotes may come from integrated DEX and aggregator protocols. The route shown reflects the quote returned for your inputs; execution depends on the transaction you sign and on-chain conditions at that time.',
  },
  {
    question: 'Why can amounts change between the quote and execution?',
    answer:
      'Markets, liquidity, network fees, and your slippage tolerance can all affect outcomes. Review the in-app preview and your wallet transaction details before you confirm.',
  },
  {
    question: 'What fees should I expect?',
    answer:
      'You pay network gas to validators. Liquidity routes may include pool or protocol fees when the quote exposes them. Your wallet shows the final cost before you sign.',
  },
] as const;
