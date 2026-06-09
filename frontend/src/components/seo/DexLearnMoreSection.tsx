/**
 * Collapsed education hub below the swap row — reduces above-the-fold density.
 * Copy-only; FAQ JSON-LD remains in structuredData.ts (not DOM-dependent).
 */

import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { KOBBEX_DEX_LANDING_FAQ } from '@/constants/kobbexDexLandingFaq';
import { CHAINS } from '@/wallet/chains';

const linkClass =
  'text-accent/90 hover:text-accent underline-offset-2 hover:underline font-medium';

const BEFORE_SIGN_ITEMS = [
  'Network in your wallet matches the network you intend to use.',
  'Token symbols, contract addresses, and amounts match what you chose in the app.',
  'You understand slippage and fee rows shown in the quote preview.',
  'You accept that on-chain transactions are difficult or impossible to reverse.',
] as const;

function LearnMoreBlock({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      className="group rounded-lg border border-white/[0.06] bg-dark-900/40 px-3 py-2"
      {...(defaultOpen ? { open: true } : {})}
    >
      <summary className="cursor-pointer text-sm font-medium text-dark-200 list-none flex items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
        <span>{title}</span>
        <span className="text-dark-500 text-xs shrink-0 group-open:rotate-180 transition-transform">
          ▾
        </span>
      </summary>
      <div className="mt-2 text-sm text-dark-400 leading-relaxed">{children}</div>
    </details>
  );
}

export function DexLearnMoreSection() {
  return (
    <section className="mt-8 pt-6 border-t border-white/[0.06]" aria-label="Learn more about Kobbex DEX">
      <details className="group rounded-2xl border border-white/[0.08] bg-electro-panel/20 overflow-hidden">
        <summary className="cursor-pointer list-none flex items-center justify-between gap-3 px-4 py-3 sm:px-5 [&::-webkit-details-marker]:hidden">
          <span className="text-sm font-semibold text-white">Learn More</span>
          <span className="text-xs text-dark-500 group-open:rotate-180 transition-transform">▾</span>
        </summary>

        <div className="px-4 pb-4 sm:px-5 sm:pb-5 space-y-2 border-t border-white/[0.06] pt-3">
          <LearnMoreBlock title="Why Swaperex">
            <p className="mb-2">
              <strong className="text-dark-200">Kobbex DEX</strong> is a non-custodial swap interface: you
              connect your wallet, review quotes, and sign transactions yourself.
            </p>
            <p>
              Legal:{' '}
              <Link to="/about" className={linkClass}>About</Link>
              {' · '}
              <Link to="/terms" className={linkClass}>Terms</Link>
              {' · '}
              <Link to="/privacy" className={linkClass}>Privacy</Link>
              {' · '}
              <Link to="/disclaimer" className={linkClass}>Disclaimer</Link>
            </p>
          </LearnMoreBlock>

          <LearnMoreBlock title="Common questions">
            <div className="space-y-2">
              {KOBBEX_DEX_LANDING_FAQ.map((item) => (
                <details
                  key={item.question}
                  className="rounded-md border border-white/[0.04] bg-black/20 px-2.5 py-1.5"
                >
                  <summary className="cursor-pointer text-xs font-medium text-dark-300 list-none [&::-webkit-details-marker]:hidden">
                    {item.question}
                  </summary>
                  <p className="mt-1.5 text-xs text-dark-500 leading-relaxed">{item.answer}</p>
                </details>
              ))}
            </div>
          </LearnMoreBlock>

          <LearnMoreBlock title="Before you sign">
            <p className="text-xs text-dark-500 mb-2">
              Your wallet executes trades — pause if anything looks off.
            </p>
            <ul className="list-disc list-inside text-xs text-dark-400 space-y-1">
              {BEFORE_SIGN_ITEMS.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </LearnMoreBlock>

          <LearnMoreBlock title="Wallet safety">
            <p>
              Only connect wallets you control. Verify token contracts and amounts in your wallet before
              signing. If something does not match what you expect, do not sign.
            </p>
          </LearnMoreBlock>

          <LearnMoreBlock title="Routing & fees">
            <div className="space-y-2 text-xs">
              <p>
                Quotes may come from integrated DEX and aggregator protocols. Amounts can move with
                liquidity, network fees, and slippage — always review the preview and wallet details.
              </p>
              <p>
                Supported networks include{' '}
                {CHAINS.map((c) => c.name).join(', ')}.
              </p>
              <p className="text-dark-500">
                You pay network fees to validators. Route or pool fees appear in the quote when provided.
              </p>
            </div>
          </LearnMoreBlock>
        </div>
      </details>
    </section>
  );
}

export default DexLearnMoreSection;
