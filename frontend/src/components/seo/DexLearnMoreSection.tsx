/**
 * Collapsed education hub below the swap row — compact footprint.
 * Copy-only; FAQ JSON-LD remains in structuredData.ts (not DOM-dependent).
 */

import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { KOBBEX_DEX_LANDING_FAQ } from '@/constants/kobbexDexLandingFaq';
import { CHAINS } from '@/wallet/chains';

const linkClass =
  'text-accent/90 hover:text-accent underline-offset-2 hover:underline font-medium';

const BEFORE_SIGN_ITEMS = [
  'Network matches your intended chain.',
  'Symbols, addresses, and amounts match the app.',
  'Slippage and fees reviewed in the preview.',
  'On-chain trades are difficult to reverse.',
] as const;

function LearnMoreBlock({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <details className="group rounded-md border border-white/[0.05] bg-black/15 px-2.5 py-1.5">
      <summary className="cursor-pointer text-xs font-medium text-dark-300 list-none flex items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
        <span>{title}</span>
        <span className="text-dark-600 text-[10px] shrink-0 group-open:rotate-180 transition-transform">
          ▾
        </span>
      </summary>
      <div className="mt-1.5 text-xs text-dark-500 leading-relaxed">{children}</div>
    </details>
  );
}

export function DexLearnMoreSection() {
  return (
    <section className="mt-6 pt-4 border-t border-white/[0.05]" aria-label="Learn more about Swaperex">
      <details className="group rounded-xl border border-white/[0.06] bg-electro-panel/15 overflow-hidden">
        <summary className="cursor-pointer list-none flex items-center justify-between gap-3 px-3 py-2.5 sm:px-4 [&::-webkit-details-marker]:hidden">
          <span className="text-xs font-medium text-dark-300">Learn More</span>
          <span className="text-[10px] text-dark-600 group-open:rotate-180 transition-transform">▾</span>
        </summary>

        <div className="px-3 pb-3 sm:px-4 sm:pb-3.5 space-y-1.5 border-t border-white/[0.05] pt-2">
          <LearnMoreBlock title="Why Swaperex">
            <p className="mb-1.5">
              Non-custodial swap interface — you connect, review quotes, and sign in your wallet.
            </p>
            <p className="text-[11px]">
              <Link to="/trust" className={linkClass}>Trust Center</Link>
              {' · '}
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
            <div className="space-y-1">
              {KOBBEX_DEX_LANDING_FAQ.slice(0, 4).map((item) => (
                <details
                  key={item.question}
                  className="rounded border border-white/[0.04] bg-black/10 px-2 py-1"
                >
                  <summary className="cursor-pointer text-[11px] font-medium text-dark-400 list-none [&::-webkit-details-marker]:hidden">
                    {item.question}
                  </summary>
                  <p className="mt-1 text-[11px] text-dark-500 leading-snug">{item.answer}</p>
                </details>
              ))}
            </div>
          </LearnMoreBlock>

          <LearnMoreBlock title="Before you sign">
            <ul className="list-disc list-inside text-[11px] space-y-0.5">
              {BEFORE_SIGN_ITEMS.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </LearnMoreBlock>

          <LearnMoreBlock title="Routing & networks">
            <p className="text-[11px]">
              Swaps with Swaperex commission routing: Ethereum and BNB Chain. Balance and network
              view also supports{' '}
              {CHAINS.filter((c) => c.id !== 1 && c.id !== 56)
                .map((c) => c.name)
                .join(', ')}
              . Review preview and wallet before signing.
            </p>
          </LearnMoreBlock>
        </div>
      </details>
    </section>
  );
}

export default DexLearnMoreSection;
