/**
 * P5.4 — Professional DEX site footer.
 * Presentation-only: real links, supported networks, live status — no fake metrics or badges.
 */

import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { SystemStatusIndicator } from '@/components/common/SystemStatusIndicator';
import { SWAP_SURFACE_COPY } from '@/constants/swapSurfaceCopy';

export type FooterPage =
  | 'swap'
  | 'send'
  | 'portfolio'
  | 'radar'
  | 'screener'
  | 'about'
  | 'terms'
  | 'privacy'
  | 'disclaimer';

export interface FooterNavTarget {
  page: FooterPage;
  /** In-page section id for SPA tabs / scroll targets */
  section?: string;
}

interface DexSiteFooterProps {
  onNavigate: (target: FooterNavTarget) => void;
}

const SWAP_NETWORKS = ['Ethereum', 'BNB Chain'] as const;
const BALANCE_VIEW_NETWORKS = ['Polygon', 'Arbitrum', 'Optimism', 'Avalanche'] as const;

function FooterLink({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left text-dark-400 hover:text-white transition-colors text-sm"
    >
      {children}
    </button>
  );
}

function FooterColumn({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-wider text-dark-300 mb-3">{title}</p>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

export function DexSiteFooter({ onNavigate }: DexSiteFooterProps) {
  return (
    <footer className="border-t border-white/[0.06] mt-auto bg-electro-bg/60 backdrop-blur-sm">
      <div className="max-w-6xl mx-auto px-4 py-10 sm:py-12">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-8 lg:gap-6">
          <div className="col-span-2 sm:col-span-3 lg:col-span-1 lg:pr-4">
            <p className="text-lg font-bold text-accent">Swaperex</p>
            <p className="mt-2 text-xs text-dark-500 leading-relaxed max-w-xs">
              {SWAP_SURFACE_COPY.footerTrustCompact}
            </p>
          </div>

          <FooterColumn title="Trade">
            <FooterLink onClick={() => onNavigate({ page: 'swap' })}>Swap</FooterLink>
            <FooterLink onClick={() => onNavigate({ page: 'send' })}>Send</FooterLink>
          </FooterColumn>

          <FooterColumn title="Portfolio">
            <FooterLink onClick={() => onNavigate({ page: 'portfolio', section: 'holdings' })}>
              Holdings
            </FooterLink>
            <FooterLink onClick={() => onNavigate({ page: 'portfolio', section: 'allocation' })}>
              Allocation
            </FooterLink>
            <FooterLink onClick={() => onNavigate({ page: 'portfolio', section: 'activity' })}>
              Activity
            </FooterLink>
          </FooterColumn>

          <FooterColumn title="Security">
            <FooterLink onClick={() => onNavigate({ page: 'radar', section: 'watchlist' })}>
              Watchlist
            </FooterLink>
            <FooterLink onClick={() => onNavigate({ page: 'radar', section: 'scanner' })}>
              Token Scanner
            </FooterLink>
            <FooterLink onClick={() => onNavigate({ page: 'radar', section: 'alerts' })}>
              Alerts
            </FooterLink>
          </FooterColumn>

          <FooterColumn title="Markets">
            <FooterLink onClick={() => onNavigate({ page: 'screener', section: 'screener' })}>
              Token Screener
            </FooterLink>
            <FooterLink onClick={() => onNavigate({ page: 'screener', section: 'discovery' })}>
              Market Discovery
            </FooterLink>
          </FooterColumn>

          <FooterColumn title="Resources">
            <Link
              to="/about"
              className="text-sm text-dark-400 hover:text-white transition-colors no-underline"
            >
              About
            </Link>
            <Link
              to="/terms"
              className="text-sm text-dark-400 hover:text-white transition-colors no-underline"
            >
              Terms
            </Link>
            <Link
              to="/privacy"
              className="text-sm text-dark-400 hover:text-white transition-colors no-underline"
            >
              Privacy
            </Link>
            <Link
              to="/disclaimer"
              className="text-sm text-dark-400 hover:text-white transition-colors no-underline"
            >
              Disclaimer
            </Link>
          </FooterColumn>
        </div>

        <div className="mt-10 pt-6 border-t border-white/[0.06] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-dark-500 mb-2">
              Networks
            </p>
            <p className="text-xs text-dark-400 leading-relaxed">
              <span className="text-dark-300">Swap networks:</span>{' '}
              {SWAP_NETWORKS.join(' · ')}
            </p>
            <p className="text-xs text-dark-500 leading-relaxed mt-1">
              <span className="text-dark-400">Balance view:</span>{' '}
              {BALANCE_VIEW_NETWORKS.join(' · ')}
            </p>
          </div>

          <div className="flex flex-col items-start sm:items-end gap-1 shrink-0">
            <p className="text-[10px] uppercase tracking-wider text-dark-500">Status</p>
            <SystemStatusIndicator variant="footer" />
          </div>
        </div>

        <p className="mt-6 text-center text-[11px] text-dark-600">
          © {new Date().getFullYear()} Swaperex · Non-custodial DEX interface
        </p>
      </div>
    </footer>
  );
}

export default DexSiteFooter;
