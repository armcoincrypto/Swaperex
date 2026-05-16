/**
 * P4 — Before-signing checklist on the landing surface.
 */

import { Link } from 'react-router-dom';

const items = [
  'Network in your wallet matches the network you intend to use.',
  'Token symbols, contract addresses, and amounts match what you chose in the app.',
  'You understand slippage and fee rows shown in the quote preview.',
  'You accept that on-chain transactions are difficult or impossible to reverse.',
] as const;

export function DexSafetyChecklist() {
  return (
    <section className="mt-6" aria-labelledby="kobbex-dex-checklist-heading">
      <div className="rounded-xl border border-white/[0.08] bg-electro-panel/15 px-4 py-4 sm:px-5">
        <h2 id="kobbex-dex-checklist-heading" className="text-sm font-semibold text-white mb-2">
          Before you sign
        </h2>
        <p className="text-xs text-dark-400 mb-3">
          Kobbex DEX does not execute trades for you — your wallet does. Pause if anything looks off.
        </p>
        <ul className="list-disc list-inside text-sm text-dark-300 space-y-1.5">
          {items.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-dark-500">
          More context:{' '}
          <Link to="/disclaimer" className="text-accent/90 hover:text-accent hover:underline">
            Disclaimer
          </Link>
          .
        </p>
      </div>
    </section>
  );
}
