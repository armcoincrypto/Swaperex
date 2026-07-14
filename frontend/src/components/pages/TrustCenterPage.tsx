/**
 * P7A — Public Trust Center (non-custodial transparency, fees, routes, safety).
 * Copy-only; no admin or telemetry data exposed.
 */

import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import {
  COMMISSION_SWAP_CHAIN_LABELS,
  COMMISSION_SWAP_CHAIN_IDS,
} from '@/constants/commissionChains';

interface TrustCenterPageProps {
  onBack: () => void;
}

const BALANCE_VIEW_NETWORKS = ['Polygon', 'Arbitrum', 'Optimism', 'Avalanche'] as const;

/** Public on-chain wrapper contracts (verified in internal production certification). */
const WRAPPER_CONTRACTS = [
  {
    network: 'Ethereum',
    label: 'Uniswap V3 wrapper V2',
    address: '0x660B2E98E9eeAA4CaE21f319FbF3D6aD6909b491',
    feeBps: 20,
    explorer: 'https://etherscan.io/address/0x660B2E98E9eeAA4CaE21f319FbF3D6aD6909b491',
  },
  {
    network: 'Ethereum',
    label: 'Uniswap V3 wrapper V3',
    address: '0xa7702Ce9267567fd811B39C886CdABeC6eB249fc',
    feeBps: 20,
    explorer: 'https://etherscan.io/address/0xa7702Ce9267567fd811B39C886CdABeC6eB249fc',
  },
  {
    network: 'Ethereum',
    label: 'Legacy wrapper V1',
    address: '0xe07f5940487a58E30F9fa711Be358FB036B0Fc44',
    feeBps: 20,
    explorer: 'https://etherscan.io/address/0xe07f5940487a58E30F9fa711Be358FB036B0Fc44',
  },
  {
    network: 'BNB Chain',
    label: 'PancakeSwap V3 wrapper V2',
    address: '0x22B1FE0ba0E451707A675CC0AC19162A83E2c3a6',
    feeBps: 50,
    explorer: 'https://bscscan.com/address/0x22B1FE0ba0E451707A675CC0AC19162A83E2c3a6',
  },
] as const;

function TrustCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-white/[0.06] bg-electro-panel/20 p-4 sm:p-5">
      <h2 className="text-base font-semibold text-white mb-3">{title}</h2>
      <div className="text-sm text-dark-300 leading-relaxed space-y-3">{children}</div>
    </section>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <details className="rounded-lg border border-white/[0.05] bg-black/20 px-3 py-2">
      <summary className="cursor-pointer text-sm font-medium text-dark-200 list-none [&::-webkit-details-marker]:hidden">
        {q}
      </summary>
      <p className="mt-2 text-xs text-dark-400 leading-relaxed">{a}</p>
    </details>
  );
}

export function TrustCenterPage({ onBack }: TrustCenterPageProps) {
  return (
    <div className="max-w-3xl mx-auto">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-2 text-dark-400 hover:text-white mb-6 transition-colors text-sm"
      >
        <span aria-hidden>←</span>
        <span>Back to swap</span>
      </button>

      <header className="mb-8">
        <p className="text-xs uppercase tracking-wider text-accent/80 font-medium mb-2">
          Transparency
        </p>
        <h1 className="text-2xl sm:text-3xl font-bold text-white">Trust Center</h1>
        <p className="mt-3 text-sm text-dark-400 leading-relaxed max-w-2xl">
          How Swaperex (Kobbex DEX) handles custody, fees, networks, and swaps — without hype.
          This page is public. Operator dashboards are separate and not shown here.
        </p>
      </header>

      <div className="space-y-4">
        <TrustCard title="Non-custodial by design">
          <p>
            Swaperex is a swap interface, not a custodian. You connect your own wallet, review
            quotes, and sign transactions yourself. We do not hold your seed phrase, private keys,
            or token balances.
          </p>
          <p>
            Settlement happens on-chain through smart contracts you approve in your wallet. Confirmed
            transactions are generally irreversible.
          </p>
        </TrustCard>

        <TrustCard title="Supported networks">
          <p>
            <span className="text-dark-200 font-medium">Commission swaps</span> (wrapper routing with
            Swaperex fee) are available on:
          </p>
          <ul className="list-disc list-inside text-dark-300 space-y-1">
            {COMMISSION_SWAP_CHAIN_IDS.map((id) => (
              <li key={id}>
                {COMMISSION_SWAP_CHAIN_LABELS[id]} <span className="text-dark-500">(chain ID {id})</span>
              </li>
            ))}
          </ul>
          <p className="text-dark-400 text-xs">
            Additional EVM networks ({BALANCE_VIEW_NETWORKS.join(', ')}) may appear for{' '}
            <span className="text-dark-300">balance viewing</span> when your wallet is connected.
            Swaps with Swaperex commission are not enabled on those networks.
          </p>
        </TrustCard>

        <TrustCard title="Commission transparency">
          <p>Swaperex applies a platform fee via on-chain wrapper contracts. Current configured rates:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>
              <span className="text-dark-200">Ethereum:</span> 20 basis points (0.20%)
            </li>
            <li>
              <span className="text-dark-200">BNB Chain:</span> 50 basis points (0.50%)
            </li>
          </ul>
          <p className="text-xs text-dark-500">
            Fees are deducted on-chain from swap output and sent to the configured treasury address.
            The quoted receive amount shown in the app is net of the Swaperex fee when wrapper routing
            applies. Pool and route costs from the underlying DEX path are separate.
          </p>
        </TrustCard>

        <TrustCard title="Production-certified routes">
          <p>
            Before pairs are enabled for commission routing, Swaperex runs an{' '}
            <span className="text-dark-200">internal production-readiness process</span>: live
            wrapper quote, commission, and transaction-preparation tests across configured pairs
            and sizes.
          </p>
          <p>
            Route certification is an internal production-readiness process. It is not automatically
            equivalent to an independent third-party smart-contract audit.
          </p>
          <p>
            Current coverage: <span className="text-dark-200">production-certified directional
            routes</span> on Ethereum and BNB Chain, verified by automated quote audits before
            release. Pair and route totals are derived from the live commission route registry.
          </p>
          <p className="text-xs text-dark-500">
            Unsupported pairs show a clear message in the swap UI. Do not assume every token pair on a
            network is routable. Reserve “external security audit” language only where third-party
            evidence exists.
          </p>
        </TrustCard>

        <TrustCard title="Wrapper & contract transparency">
          <p>Commission swaps route through deployed wrapper contracts. Verify on block explorers:</p>
          <ul className="space-y-3">
            {WRAPPER_CONTRACTS.map((w) => (
              <li key={w.address} className="text-xs font-mono break-all">
                <span className="text-dark-200">{w.network}</span> — {w.label}{' '}
                <span className="text-dark-500">({w.feeBps} bps)</span>
                <br />
                <a
                  href={w.explorer}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline"
                >
                  {w.address}
                </a>
              </li>
            ))}
          </ul>
          <p className="text-xs text-dark-500">
            Treasury recipient is configured on-chain in each wrapper. Always confirm the spender and
            contract in your wallet before signing.
          </p>
        </TrustCard>

        <TrustCard title="Wallet safety">
          <ul className="list-disc list-inside space-y-2 text-dark-300">
            <li>Connect only through the official site: dex.kobbex.com</li>
            <li>Review token symbols, amounts, and spender addresses in your wallet</li>
            <li>Approvals grant a contract permission to move tokens — verify limits</li>
            <li>Quotes expire; refresh if the market moved before signing</li>
            <li>Swaperex uses WalletConnect — we never ask for your seed phrase</li>
          </ul>
        </TrustCard>

        <TrustCard title="Unsupported chains & why they appear">
          <p>
            The network selector may list chains where you can view balances but cannot run Swaperex
            commission swaps. This is intentional: swap routing is limited to audited wrapper
            deployments on Ethereum and BNB Chain.
          </p>
          <p className="text-xs text-dark-500">
            Selecting an unsupported chain for swaps shows a warning with options to switch to a swap
            network. No funds are moved until you sign a transaction.
          </p>
        </TrustCard>

        <TrustCard title="Operational monitoring (high level)">
          <p>
            Swaperex collects anonymized product telemetry (quote events, swap outcomes, funnel steps)
            to monitor reliability and improve the interface. This data feeds internal operator tools
            only — not public dashboards.
          </p>
          <p className="text-xs text-dark-500">
            Recommendations shown to operators require sufficient sample size before suggesting pair or
            configuration changes. Low traffic periods may show “insufficient data” internally.
          </p>
        </TrustCard>

        <TrustCard title="FAQ">
          <div className="space-y-2">
            <FaqItem
              q="Does Swaperex hold my crypto?"
              a="No. Assets stay in your wallet until you sign a transaction that moves them on-chain."
            />
            <FaqItem
              q="Why is my network not supported for swaps?"
              a="Commission wrapper swaps are enabled on Ethereum and BNB Chain only. Other networks may support balance viewing."
            />
            <FaqItem
              q="What fees do I pay?"
              a="Network gas, underlying DEX pool/route costs where applicable, and the Swaperex wrapper fee (20 bps on Ethereum, 50 bps on BNB Chain) when commission routing is used."
            />
            <FaqItem
              q="Can I reverse a swap?"
              a="On-chain swaps are generally final once confirmed. There is no undo button."
            />
            <FaqItem
              q="Is this audited by an external firm?"
              a="Swaperex uses internal production certification (wrapper quote audits, deploy checks). We do not claim third-party smart contract audits unless published separately."
            />
          </div>
        </TrustCard>

        <TrustCard title="Risk disclaimer">
          <p>
            Cryptocurrency trading involves volatility, smart contract, and operational risks. Prices
            and liquidity change quickly. Use amounts you can afford to lose.
          </p>
          <p className="text-xs">
            <Link to="/disclaimer" className="text-accent hover:underline">
              Full disclaimer
            </Link>
            {' · '}
            <Link to="/terms" className="text-accent hover:underline">
              Terms
            </Link>
            {' · '}
            <Link to="/privacy" className="text-accent hover:underline">
              Privacy
            </Link>
          </p>
        </TrustCard>
      </div>
    </div>
  );
}

export default TrustCenterPage;
