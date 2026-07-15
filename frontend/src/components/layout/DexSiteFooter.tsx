/**
 * P5.4 / P20 — Professional DEX site footer (simplified columns).
 */

import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { SystemStatusIndicator } from '@/components/common/SystemStatusIndicator';
import { SWAP_SURFACE_COPY } from '@/constants/swapSurfaceCopy';
import { APP_ROUTE_PATHS } from '@/config/appRoutes';
import {
  HOMEPAGE_INTEGRATIONS,
  HOMEPAGE_INTEGRATIONS_DISCLAIMER,
} from '@/constants/homepageProductCopy';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { BRAND } from '@/constants/brand';

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
  section?: string;
}

interface DexSiteFooterProps {
  onNavigate: (target: FooterNavTarget) => void;
}

const SWAP_NETWORKS = ['Ethereum', 'BNB Chain'] as const;

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
      className="text-left text-dark-400 hover:text-white transition-colors text-sm min-h-[44px] sm:min-h-0 py-1"
    >
      {children}
    </button>
  );
}

function FooterColumn({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-wider text-dark-300 mb-3">{title}</p>
      <div className="flex flex-col gap-1.5 sm:gap-2">{children}</div>
    </div>
  );
}

export function DexSiteFooter({ onNavigate }: DexSiteFooterProps) {
  return (
    <footer className="border-t border-white/[0.06] mt-auto bg-electro-bg/60 backdrop-blur-sm">
      <div className="max-w-6xl mx-auto px-4 py-10 sm:py-12">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-8 lg:gap-6">
          <div className="col-span-2 sm:col-span-3 lg:col-span-1 lg:pr-2">
            <BrandLogo
              variant="full"
              showParentBrand
              onNavigateHome={() => onNavigate({ page: 'swap' })}
            />
            <p className="mt-3 text-xs text-dark-500 leading-relaxed max-w-xs">
              {SWAP_SURFACE_COPY.footerTrustCompact}
            </p>
          </div>

          <FooterColumn title="Product">
            <FooterLink onClick={() => onNavigate({ page: 'swap' })}>Trade</FooterLink>
            <FooterLink onClick={() => onNavigate({ page: 'portfolio' })}>Portfolio</FooterLink>
            <FooterLink onClick={() => onNavigate({ page: 'radar' })}>Security</FooterLink>
            <FooterLink onClick={() => onNavigate({ page: 'screener' })}>Markets</FooterLink>
          </FooterColumn>

          <FooterColumn title="Company">
            <Link
              to="/about"
              className="text-sm text-dark-400 hover:text-white transition-colors no-underline py-1"
            >
              About
            </Link>
            <Link
              to={APP_ROUTE_PATHS.trust}
              className="text-sm text-dark-400 hover:text-white transition-colors no-underline py-1"
            >
              Trust Center
            </Link>
            <div className="pt-1">
              <SystemStatusIndicator variant="footer" />
            </div>
          </FooterColumn>

          <FooterColumn title="Legal">
            <Link
              to="/terms"
              className="text-sm text-dark-400 hover:text-white transition-colors no-underline py-1"
            >
              Terms
            </Link>
            <Link
              to="/privacy"
              className="text-sm text-dark-400 hover:text-white transition-colors no-underline py-1"
            >
              Privacy
            </Link>
            <Link
              to="/disclaimer"
              className="text-sm text-dark-400 hover:text-white transition-colors no-underline py-1"
            >
              Disclaimer
            </Link>
          </FooterColumn>

          <FooterColumn title="Networks">
            {SWAP_NETWORKS.map((n) => (
              <span key={n} className="text-sm text-dark-400 py-1">
                {n}
              </span>
            ))}
          </FooterColumn>
        </div>

        <div className="mt-10 pt-6 border-t border-white/[0.06]">
          <p className="text-xs text-dark-400 leading-relaxed max-w-3xl">
            {HOMEPAGE_INTEGRATIONS.join(' · ')}
          </p>
          <p className="mt-1.5 text-[11px] text-dark-600 leading-relaxed max-w-3xl">
            {HOMEPAGE_INTEGRATIONS_DISCLAIMER}
          </p>
        </div>

        <p className="mt-6 text-center text-[11px] text-dark-600">
          © {new Date().getFullYear()} {BRAND.displayName} {BRAND.byline} · {BRAND.domain}
        </p>
      </div>
    </footer>
  );
}

export default DexSiteFooter;
