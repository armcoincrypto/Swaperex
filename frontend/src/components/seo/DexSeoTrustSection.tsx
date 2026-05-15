/**
 * Compact trust + SEO copy for the public swap surface.
 * Copy-only — no swap, wallet, or routing behavior.
 */

import { CHAINS } from '@/wallet/chains';

export function DexSeoTrustSection() {
  return (
    <section
      className="mt-10 pt-8 border-t border-white/[0.06]"
      aria-label="About Kobbex DEX"
    >
      <div className="rounded-2xl border border-white/[0.08] bg-electro-panel/30 p-5 sm:p-6 space-y-8">
        <div>
          <h2 className="text-lg font-bold text-white mb-2">Why Kobbex DEX</h2>
          <p className="text-sm text-dark-300 leading-relaxed">
            Kobbex DEX is a non-custodial interface for swapping tokens on supported networks. You
            choose assets and amounts; the app requests quotes and prepares transactions for you to
            review and sign in your own wallet.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-bold text-white mb-2">Non-custodial by design</h2>
          <p className="text-sm text-dark-300 leading-relaxed">
            The interface does not hold your keys or custody your funds. Approvals and swaps are
            signed in your wallet; settlement happens on-chain according to the transaction you
            confirm.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-bold text-white mb-2">Supported networks</h2>
          <p className="text-sm text-dark-300 leading-relaxed mb-3">
            Network availability follows the wallets and RPC endpoints you use. The app is built
            around these supported chains:
          </p>
          <ul className="list-disc list-inside text-sm text-dark-300 space-y-1.5">
            {CHAINS.map((c) => (
              <li key={c.id}>
                {c.name} <span className="text-dark-500">(chain ID {c.id})</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-bold text-white mb-3">Routing, fees, and slippage</h2>
          <div className="space-y-2">
            <details className="group rounded-lg border border-white/[0.06] bg-dark-900/40 px-3 py-2">
              <summary className="cursor-pointer text-sm font-medium text-dark-200 list-none flex items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
                <span>How are routes chosen?</span>
                <span className="text-dark-500 text-xs group-open:rotate-180 transition-transform">
                  ▾
                </span>
              </summary>
              <p className="mt-2 text-sm text-dark-400 leading-relaxed pl-0.5">
                Quotes may come from integrated DEX and aggregator protocols. The path shown in the
                UI reflects the quote you requested; execution depends on the transaction you sign
                and on-chain conditions at that time.
              </p>
            </details>
            <details className="group rounded-lg border border-white/[0.06] bg-dark-900/40 px-3 py-2">
              <summary className="cursor-pointer text-sm font-medium text-dark-200 list-none flex items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
                <span>Why can amounts change?</span>
                <span className="text-dark-500 text-xs group-open:rotate-180 transition-transform">
                  ▾
                </span>
              </summary>
              <p className="mt-2 text-sm text-dark-400 leading-relaxed pl-0.5">
                Quotes can move with market activity, liquidity, network fees, and the slippage
                tolerance you set. Always review the preview in the app and the transaction details
                in your wallet before signing.
              </p>
            </details>
            <details className="group rounded-lg border border-white/[0.06] bg-dark-900/40 px-3 py-2">
              <summary className="cursor-pointer text-sm font-medium text-dark-200 list-none flex items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
                <span>What fees should I expect?</span>
                <span className="text-dark-500 text-xs group-open:rotate-180 transition-transform">
                  ▾
                </span>
              </summary>
              <p className="mt-2 text-sm text-dark-400 leading-relaxed pl-0.5">
                You pay network fees to validators. Liquidity pools and routes can include protocol
                or route fees shown in the quote where applicable. The interface surfaces fee-related
                rows when the quote provides them; your wallet shows the final transaction cost before
                you confirm.
              </p>
            </details>
          </div>
        </div>

        <div>
          <h2 className="text-lg font-bold text-white mb-2">Wallet safety</h2>
          <p className="text-sm text-dark-300 leading-relaxed">
            Only connect wallets you control, verify token contracts and amounts in your wallet, and
            be cautious of phishing sites. If something in a transaction does not match what you
            expect, do not sign.
          </p>
        </div>
      </div>
    </section>
  );
}
