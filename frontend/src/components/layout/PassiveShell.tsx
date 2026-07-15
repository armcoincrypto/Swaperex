/**
 * P8A.2 — Informational-route chrome only (no trade/wallet graph).
 */

import { useEffect, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { DexSiteFooter, type FooterNavTarget } from '@/components/layout/DexSiteFooter';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { APP_ROUTE_PATHS, footerPageToPath, pageToPath } from '@/config/appRoutes';
import { applyClientRouteSeo } from '@/utils/routeSeo';

export function PassiveShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    applyClientRouteSeo(location.pathname);
  }, [location.pathname]);

  const handleFooterNavigate = (target: FooterNavTarget) => {
    navigate(footerPageToPath(target.page, target.section));
  };

  return (
    <div className="min-h-screen bg-electro-bg bg-bg-mesh overflow-x-hidden flex flex-col pb-[env(safe-area-inset-bottom)]">
      <header className="border-b border-white/[0.06] backdrop-blur-sm bg-electro-bg/80 sticky top-0 z-40 pt-[env(safe-area-inset-top)]">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <BrandLogo variant="full" showParentBrand />
          <nav className="flex items-center gap-2 sm:gap-3">
            <Link
              to={APP_ROUTE_PATHS.trust}
              className="hidden sm:inline text-sm text-dark-400 hover:text-white transition-colors no-underline"
            >
              Trust Center
            </Link>
            <Link
              to={pageToPath('swap')}
              className="h-11 min-h-[44px] px-4 inline-flex items-center rounded-lg border border-white/[0.08] bg-electro-panel/50 text-sm font-medium text-dark-300 hover:text-white hover:bg-electro-panel transition-colors no-underline"
            >
              Open Trade
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 sm:py-10 min-w-0 w-full flex-1">
        {children}
      </main>

      <DexSiteFooter onNavigate={handleFooterNavigate} />
    </div>
  );
}

export default PassiveShell;
