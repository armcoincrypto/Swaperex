/**
 * P8A.2 — Informational-route chrome only (no trade/wallet graph).
 *
 * Hard rules: no wallet hooks/modules, bootstrap, network UI, swap panel,
 * connector host, or signing libraries. Trade CTA navigates to DexMain.
 */

import { useEffect, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { DexSiteFooter, type FooterNavTarget } from '@/components/layout/DexSiteFooter';
import { applyClientRouteSeo } from '@/utils/routeSeo';

const PASSIVE_FOOTER_PATH: Partial<Record<FooterNavTarget['page'], string>> = {
  about: '/about',
  terms: '/terms',
  privacy: '/privacy',
  disclaimer: '/disclaimer',
};

export function PassiveShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    applyClientRouteSeo(location.pathname);
  }, [location.pathname]);

  const handleFooterNavigate = (target: FooterNavTarget) => {
    const passivePath = PASSIVE_FOOTER_PATH[target.page];
    if (passivePath) {
      navigate(passivePath);
      return;
    }
    if (target.page === 'swap') {
      navigate('/');
      return;
    }
    // Handoff trade tabs to DexMain via location state (no wallet imports here).
    navigate('/', {
      state: { dexPage: target.page, section: target.section },
    });
  };

  return (
    <div className="min-h-screen bg-electro-bg bg-bg-mesh overflow-x-hidden flex flex-col">
      <header className="border-b border-white/[0.06] backdrop-blur-sm bg-electro-bg/80 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <Link to="/" className="text-xl font-bold text-accent no-underline hover:opacity-90">
            Swaperex
          </Link>
          <nav className="flex items-center gap-2 sm:gap-3">
            <Link
              to="/trust"
              className="hidden sm:inline text-sm text-dark-400 hover:text-white transition-colors no-underline"
            >
              Trust Center
            </Link>
            <Link
              to="/"
              className="h-10 px-4 inline-flex items-center rounded-lg border border-white/[0.08] bg-electro-panel/50 text-sm font-medium text-dark-300 hover:text-white hover:bg-electro-panel transition-colors no-underline"
            >
              Open swap
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
