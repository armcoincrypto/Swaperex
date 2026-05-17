/**
 * Main Application Component
 *
 * Routes and global layout.
 * SECURITY: All signing happens client-side via connected wallet.
 */

import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { LazyWalletBootstrap, LazyWalletConnect } from '@/components/wallet/lazyWalletChunks';
import { SwapInterface } from '@/components/swap/SwapInterface';
import { ChainWarningBanner } from '@/components/chain/ChainWarning';
import { ToastContainer } from '@/components/common/Toast';
import { GlobalErrorDisplay } from '@/components/common/GlobalErrorDisplay';
import { NetworkSelector } from '@/components/common/NetworkSelector';
import { SystemStatusIndicator } from '@/components/common/SystemStatusIndicator';
import { useWallet } from '@/hooks/useWallet';
import { useSwapStore } from '@/stores/swapStore';
import { useToastStore } from '@/stores/toastStore';
import { useRadarStore, type RadarSignal } from '@/stores/radarStore';
import { useSignalsHealthStore } from '@/stores/signalsHealthStore';
import { useSystemStatusStore } from '@/stores/systemStatusStore';
import { type SwapRecord } from '@/stores/swapHistoryStore';
import { getTokenBySymbol } from '@/tokens';
import { useWalletBootstrapStore } from '@/stores/walletBootstrapStore';
import {
  hasWalletConnectStorageHint,
  subscribeWalletBootstrapRequest,
} from '@/services/wallet/appKitActionsRegistry';
import { SHOW_OPTIONAL_PRIMARY_NAV } from '@/config/productShell';
import { SWAP_SURFACE_COPY } from '@/constants/swapSurfaceCopy';
import { applyClientRouteSeo, normalizePublicPath } from '@/utils/routeSeo';

const LazySendPage = lazy(() => import('@/components/send/SendPage'));
const LazyPortfolioPage = lazy(() => import('@/components/portfolio/PortfolioPage'));
const LazyTokenScreener = lazy(() => import('@/components/screener/TokenScreener'));
const LazyRadarPanel = lazy(() => import('@/components/radar/RadarPanel'));

const LazyAboutPage = lazy(() =>
  import('@/components/pages/StaticPages').then((m) => ({ default: m.AboutPage }))
);
const LazyTermsPage = lazy(() =>
  import('@/components/pages/StaticPages').then((m) => ({ default: m.TermsPage }))
);
const LazyPrivacyPage = lazy(() =>
  import('@/components/pages/StaticPages').then((m) => ({ default: m.PrivacyPage }))
);
const LazyDisclaimerPage = lazy(() =>
  import('@/components/pages/StaticPages').then((m) => ({ default: m.DisclaimerPage }))
);

const LazyAdminApp = lazy(() => import('@/components/admin/AdminApp'));

const LazyTokenList = lazy(() =>
  import('@/components/balances/TokenList').then((m) => ({ default: m.TokenList }))
);
const LazyDexLandingIntro = lazy(() =>
  import('@/components/seo/DexLandingIntro').then((m) => ({ default: m.DexLandingIntro }))
);
const LazyDexHowItWorksSection = lazy(() =>
  import('@/components/seo/DexHowItWorksSection').then((m) => ({ default: m.DexHowItWorksSection }))
);
const LazyDexFaqSection = lazy(() =>
  import('@/components/seo/DexFaqSection').then((m) => ({ default: m.DexFaqSection }))
);
const LazyDexSafetyChecklist = lazy(() =>
  import('@/components/seo/DexSafetyChecklist').then((m) => ({ default: m.DexSafetyChecklist }))
);
const LazyDexSeoTrustSection = lazy(() =>
  import('@/components/seo/DexSeoTrustSection').then((m) => ({ default: m.DexSeoTrustSection }))
);

const lazyAdminFallback = (
  <div className="min-h-screen bg-dark-950 flex items-center justify-center">
    <p className="text-sm text-dark-400">Loading admin…</p>
  </div>
);

const lazyTabFallback = (
  <div className="flex justify-center py-16">
    <p className="text-sm text-dark-400">Loading…</p>
  </div>
);

const lazyWalletConnectFallback = (
  <div className="flex items-center justify-end gap-2" aria-hidden>
    <div className="h-10 w-24 rounded-lg bg-dark-800/80 animate-pulse" />
    <div className="h-10 w-32 rounded-lg bg-dark-800/80 animate-pulse" />
  </div>
);

/** P5 — Below-fold swap education; lazy chunk defers parse until after swap shell. */
const lazySwapEducationFallback = (
  <div
    className="mt-8 pt-6 border-t border-white/[0.06] min-h-[8rem] flex items-center justify-center"
    aria-hidden
  >
    <p className="text-sm text-dark-400">Loading…</p>
  </div>
);

/** P5 — Balances sidebar placeholder (swap/send when connected). */
const lazyTokenListSidebarFallback = (
  <aside className="w-full lg:w-80 space-y-3" aria-hidden>
    <div className="h-8 w-32 rounded-lg bg-dark-800/80 animate-pulse" />
    <div className="h-24 rounded-xl bg-dark-800/60 animate-pulse" />
    <div className="h-24 rounded-xl bg-dark-800/60 animate-pulse" />
  </aside>
);

type Page = 'swap' | 'send' | 'portfolio' | 'radar' | 'screener' | 'about' | 'terms' | 'privacy' | 'disclaimer';

/**
 * P3-A: map URL → `currentPage` for crawlable informational routes only.
 * `/` is not mapped here (swap vs send/portfolio share `/` until those routes exist).
 */
function pathToPage(pathname: string): Extract<Page, 'about' | 'terms' | 'privacy' | 'disclaimer'> | null {
  switch (normalizePublicPath(pathname)) {
    case '/about':
      return 'about';
    case '/terms':
      return 'terms';
    case '/privacy':
      return 'privacy';
    case '/disclaimer':
      return 'disclaimer';
    default:
      return null;
  }
}

/** P3-A: map `currentPage` → URL; `null` = leave path handling to caller (non-routed tabs). */
function pageToPath(page: Page): '/' | '/about' | '/terms' | '/privacy' | '/disclaimer' | null {
  switch (page) {
    case 'swap':
      return '/';
    case 'about':
      return '/about';
    case 'terms':
      return '/terms';
    case 'privacy':
      return '/privacy';
    case 'disclaimer':
      return '/disclaimer';
    default:
      return null;
  }
}

function readInitialPageFromUrl(): Page {
  if (typeof window === 'undefined') return 'swap';
  const mapped = pathToPage(window.location.pathname);
  return mapped ?? 'swap';
}

/**
 * P4.4.4 — Load the lazy `WalletConnect` header chunk only when the user is likely to need it,
 * or when a wallet / AppKit host session is already active. Avoids pulling the header wallet UI
 * bundle on passive routes (radar, screener, static pages) for cold, disconnected sessions.
 *
 * `walletHostNeeded` covers AppKit bootstrap + deferred storage-hint restore before `isConnected`
 * flips true (AppKitBridge sync), so we do not regress reconnect UX in the header.
 */
function shouldLoadHeaderWalletChunk(params: {
  currentPage: Page;
  isConnected: boolean;
  isReadOnly: boolean;
  walletHostNeeded: boolean;
}): boolean {
  if (params.walletHostNeeded || params.isConnected || params.isReadOnly) return true;
  return (
    params.currentPage === 'swap' ||
    params.currentPage === 'send' ||
    params.currentPage === 'portfolio'
  );
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/admin/*"
        element={
          <Suspense fallback={lazyAdminFallback}>
            <LazyAdminApp />
          </Suspense>
        }
      />
      <Route path="/*" element={<DexMain />} />
    </Routes>
  );
}

function DexMain() {
  const navigate = useNavigate();
  const location = useLocation();
  const [currentPage, setCurrentPage] = useState<Page>(readInitialPageFromUrl);
  const walletHostNeeded = useWalletBootstrapStore((s) => s.needed);
  const { isConnected, isWrongChain, isReadOnly, chainId, switchNetwork } = useWallet();
  const { setFromAsset, setToAsset, setFromAmount } = useSwapStore();
  const { toasts, removeToast } = useToastStore();
  const { getUnreadCount } = useRadarStore();
  const [bannerDismissed, setBannerDismissed] = useState(false);
  /** P7.3 — defer below-fold SEO/trust sections until scroll intent or crawler fallback (mobile LCP). */
  const [showBelowFoldSeo, setShowBelowFoldSeo] = useState(false);
  const belowFoldSeoSentinelRef = useRef<HTMLDivElement | null>(null);

  const radarUnreadCount = SHOW_OPTIONAL_PRIMARY_NAV ? getUnreadCount() : 0;

  // Health checks
  const refreshSignalsHealth = useSignalsHealthStore((s) => s.refresh);
  const refreshSystemStatus = useSystemStatusStore((s) => s.refresh);

  // Auto-check health on mount and every 60 seconds
  useEffect(() => {
    refreshSignalsHealth();
    refreshSystemStatus();

    const intervalId = setInterval(() => {
      refreshSignalsHealth();
      refreshSystemStatus();
    }, 60_000);
    return () => clearInterval(intervalId);
  }, [refreshSignalsHealth, refreshSystemStatus]);

  // P7.3 — reveal below-fold SEO when sentinel nears viewport (scroll intent) or after 8s for crawlers.
  useEffect(() => {
    if (currentPage !== 'swap') {
      setShowBelowFoldSeo(false);
      return;
    }

    let revealed = false;
    const reveal = () => {
      if (revealed) return;
      revealed = true;
      setShowBelowFoldSeo(true);
    };

    const crawlerFallbackId = window.setTimeout(reveal, 8000);

    const sentinel = belowFoldSeoSentinelRef.current;
    let observer: IntersectionObserver | undefined;

    if (sentinel && typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            reveal();
            observer?.disconnect();
          }
        },
        { root: null, rootMargin: '0px 0px 200px 0px', threshold: 0 },
      );
      observer.observe(sentinel);
    }

    return () => {
      window.clearTimeout(crawlerFallbackId);
      observer?.disconnect();
    };
  }, [currentPage]);

  useEffect(() => {
    return subscribeWalletBootstrapRequest(() => {
      useWalletBootstrapStore.getState().request();
    });
  }, []);

  /**
   * P4.4.2 — Defer WalletBootstrap for WC/Reown persistence hints only so `vendor-reown-walletconnect`
   * does not load in the same critical window as first paint. Explicit `request()` (connect /
   * disconnect / waitForAppKitActions) stays immediate. Cleanup avoids activating after unmount
   * (e.g. fast navigation to `/admin`).
   */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!hasWalletConnectStorageHint()) return;

    let cancelled = false;
    const activate = () => {
      if (cancelled) return;
      useWalletBootstrapStore.getState().request();
    };

    let idleHandle: number | undefined;
    if (typeof window.requestIdleCallback === 'function') {
      idleHandle = window.requestIdleCallback(activate, { timeout: 400 });
    } else {
      requestAnimationFrame(() => {
        requestAnimationFrame(activate);
      });
    }

    return () => {
      cancelled = true;
      if (idleHandle !== undefined && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleHandle);
      }
    };
  }, []);

  const goToPage = useCallback(
    (page: Page) => {
      const path = pageToPath(page);
      if (path !== null) {
        navigate(path);
      } else if (pathToPage(location.pathname) != null) {
        navigate('/');
      }
      setCurrentPage(page);
    },
    [navigate, location.pathname],
  );

  /**
   * P3-A — Keep `currentPage` aligned with informational URLs; unknown paths → `/` + swap.
   * Path `/` does not override send/portfolio/radar/screener.
   */
  useEffect(() => {
    const p = normalizePublicPath(location.pathname);
    const mapped = pathToPage(p);
    if (mapped) {
      setCurrentPage(mapped);
      return;
    }
    if (p !== '/') {
      navigate('/', { replace: true });
      setCurrentPage('swap');
      return;
    }
    if (
      currentPage === 'about' ||
      currentPage === 'terms' ||
      currentPage === 'privacy' ||
      currentPage === 'disclaimer'
    ) {
      setCurrentPage('swap');
    }
  }, [location.pathname, navigate, currentPage]);

  /** P3-C — title, meta description, canonical, og/twitter from public path. */
  useEffect(() => {
    applyClientRouteSeo(location.pathname);
  }, [location.pathname]);

  /**
   * SPA navigation bus — components without prop access (e.g. the Terms gate
   * inside `WalletConnect` / `SwapInterface`) emit `swaperex:navigate` with
   * `detail.page` to route to a static page like Terms or Privacy.
   */
  useEffect(() => {
    const allowed: Page[] = ['swap', 'send', 'portfolio', 'radar', 'screener', 'about', 'terms', 'privacy', 'disclaimer'];
    const onNav = (event: Event) => {
      const detail = (event as CustomEvent<{ page?: string }>).detail;
      const target = detail?.page;
      if (target && (allowed as string[]).includes(target)) {
        goToPage(target as Page);
      }
    };
    window.addEventListener('swaperex:navigate', onNav as EventListener);
    return () => window.removeEventListener('swaperex:navigate', onNav as EventListener);
  }, [goToPage]);

  // Handle chain switch from banner
  const handleBannerSwitch = async () => {
    try {
      await switchNetwork(1); // Switch to Ethereum mainnet
      setBannerDismissed(false);
    } catch (err) {
      console.error('Failed to switch network:', err);
    }
  };

  // Handle swap selection from screener - prefill swap form
  const handleScreenerSwapSelect = async (fromSymbol: string, toSymbol: string, targetChainId: number) => {
    // Switch chain if needed
    if (chainId !== targetChainId) {
      try {
        await switchNetwork(targetChainId);
      } catch (err) {
        console.error('Failed to switch network:', err);
      }
    }

    // Get token info and prefill form
    const fromToken = getTokenBySymbol(fromSymbol, targetChainId);
    const toToken = getTokenBySymbol(toSymbol, targetChainId);

    if (fromToken) {
      setFromAsset({
        symbol: fromToken.symbol,
        name: fromToken.name,
        chain: targetChainId === 56 ? 'bsc' : 'ethereum',
        decimals: fromToken.decimals,
        is_native: fromSymbol === 'ETH' || fromSymbol === 'BNB',
        contract_address: fromToken.address,
        logo_url: fromToken.logoURI,
      });
    }

    if (toToken) {
      setToAsset({
        symbol: toToken.symbol,
        name: toToken.name,
        chain: targetChainId === 56 ? 'bsc' : 'ethereum',
        decimals: toToken.decimals,
        is_native: toSymbol === 'ETH' || toSymbol === 'BNB',
        contract_address: toToken.address,
        logo_url: toToken.logoURI,
      });
    }

    // Navigate to swap page
    goToPage('swap');
  };

  // Handle swap from portfolio v2 - prefill from token and go to swap
  const handlePortfolioSwapV2 = (symbol: string, targetChainId: number) => {
    const cid = targetChainId || chainId || 1;
    const token = getTokenBySymbol(symbol, cid);
    if (token) {
      setFromAsset({
        symbol: token.symbol,
        name: token.name,
        chain: cid === 56 ? 'bsc' : cid === 137 ? 'polygon' : 'ethereum',
        decimals: token.decimals,
        is_native: symbol === 'ETH' || symbol === 'BNB' || symbol === 'MATIC',
        contract_address: token.address,
        logo_url: token.logoURI,
      });
      const stablecoin = getTokenBySymbol('USDT', cid);
      if (stablecoin && stablecoin.symbol !== symbol) {
        setToAsset({
          symbol: stablecoin.symbol,
          name: stablecoin.name,
          chain: cid === 56 ? 'bsc' : cid === 137 ? 'polygon' : 'ethereum',
          decimals: stablecoin.decimals,
          is_native: false,
          contract_address: stablecoin.address,
          logo_url: stablecoin.logoURI,
        });
      }
    }
    goToPage('swap');
  };

  // Handle radar signal click - navigate to swap with token prefilled
  const handleRadarSignalClick = (signal: RadarSignal) => {
    // Try to find the token in our known tokens
    const token = getTokenBySymbol(signal.tokenSymbol, signal.chainId);

    if (token) {
      setFromAsset({
        symbol: token.symbol,
        name: token.name,
        chain: signal.chainId === 56 ? 'bsc' : signal.chainId === 137 ? 'polygon' : 'ethereum',
        decimals: token.decimals,
        is_native: signal.tokenSymbol === 'ETH' || signal.tokenSymbol === 'BNB' || signal.tokenSymbol === 'MATIC',
        contract_address: token.address,
        logo_url: token.logoURI,
      });
    } else {
      // For custom tokens, create asset from signal data
      setFromAsset({
        symbol: signal.tokenSymbol,
        name: signal.tokenSymbol,
        chain: signal.chainId === 56 ? 'bsc' : signal.chainId === 137 ? 'polygon' : 'ethereum',
        decimals: 18,
        is_native: false,
        contract_address: signal.tokenAddress,
      });
    }

    // Set stablecoin as "to" token
    const stablecoin = getTokenBySymbol('USDT', signal.chainId);
    if (stablecoin) {
      setToAsset({
        symbol: stablecoin.symbol,
        name: stablecoin.name,
        chain: signal.chainId === 56 ? 'bsc' : signal.chainId === 137 ? 'polygon' : 'ethereum',
        decimals: stablecoin.decimals,
        is_native: false,
        contract_address: stablecoin.address,
        logo_url: stablecoin.logoURI,
      });
    }

    // Navigate to swap
    goToPage('swap');
  };

  // Handle Quick Repeat from swap history
  const handleRepeatSwap = (record: SwapRecord) => {
    // Prefill from asset
    setFromAsset(record.fromAsset);

    // Prefill to asset
    setToAsset(record.toAsset);

    // Prefill amount
    setFromAmount(record.fromAmount);

    // Navigate to swap page
    goToPage('swap');
  };

  return (
    <div className="min-h-screen bg-electro-bg bg-bg-mesh">
      {walletHostNeeded && (
        <Suspense fallback={null}>
          <LazyWalletBootstrap />
        </Suspense>
      )}
      {/* Header */}
      <header className="border-b border-white/[0.06] backdrop-blur-sm bg-electro-bg/80 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-8">
            {/* Logo */}
            <h1 className="text-xl font-bold text-accent">Swaperex</h1>

            {/* Navigation */}
            <nav className="flex gap-1">
              <NavButton
                active={currentPage === 'swap'}
                onClick={() => goToPage('swap')}
              >
                Swap
              </NavButton>
              <NavButton
                active={currentPage === 'send'}
                onClick={() => goToPage('send')}
              >
                Send
              </NavButton>
              {SHOW_OPTIONAL_PRIMARY_NAV && (
                <>
                  <NavButton
                    active={currentPage === 'portfolio'}
                    onClick={() => goToPage('portfolio')}
                  >
                    Portfolio
                  </NavButton>
                  <NavButton
                    active={currentPage === 'radar'}
                    onClick={() => goToPage('radar')}
                    badge={radarUnreadCount > 0 ? radarUnreadCount : undefined}
                  >
                    Radar
                  </NavButton>
                  <NavButton
                    active={currentPage === 'screener'}
                    onClick={() => goToPage('screener')}
                  >
                    Screener
                  </NavButton>
                </>
              )}
            </nav>
          </div>

          {/* Network Selector and Wallet Connection */}
          <div className="flex items-center gap-3">
            <NetworkSelector />
            {shouldLoadHeaderWalletChunk({
              currentPage,
              isConnected,
              isReadOnly,
              walletHostNeeded,
            }) ? (
              <Suspense fallback={lazyWalletConnectFallback}>
                <LazyWalletConnect />
              </Suspense>
            ) : (
              <button
                type="button"
                onClick={() => goToPage('swap')}
                className="h-10 px-4 rounded-lg border border-white/[0.08] bg-electro-panel/50 text-sm font-medium text-dark-300 hover:text-white hover:bg-electro-panel transition-colors"
              >
                Wallet
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Chain Warning Banner */}
      {isConnected && isWrongChain && !isReadOnly && !bannerDismissed && (
        <ChainWarningBanner
          chainId={chainId}
          onSwitch={handleBannerSwitch}
          onDismiss={() => setBannerDismissed(true)}
        />
      )}

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-8 sm:py-10">
        {currentPage === 'swap' && (
          <>
            <div className="flex flex-col lg:flex-row gap-10 lg:items-start">
              {/* Swap Panel */}
              <div className="flex-1 flex justify-center">
                <SwapInterface />
              </div>

              {/* Balances Sidebar */}
              {isConnected && (
                <Suspense fallback={lazyTokenListSidebarFallback}>
                  <aside className="w-full lg:w-80">
                    <LazyTokenList />
                  </aside>
                </Suspense>
              )}
            </div>
            <div ref={belowFoldSeoSentinelRef} className="h-px w-full" aria-hidden />
            {showBelowFoldSeo && (
              <Suspense fallback={lazySwapEducationFallback}>
                <LazyDexLandingIntro />
                <LazyDexHowItWorksSection />
                <LazyDexFaqSection />
                <LazyDexSafetyChecklist />
                <LazyDexSeoTrustSection />
              </Suspense>
            )}
          </>
        )}

        {currentPage === 'send' && (
          <Suspense fallback={lazyTabFallback}>
            <div className="flex flex-col lg:flex-row gap-8">
              {/* Send Panel */}
              <div className="flex-1 flex justify-center">
                {isConnected ? (
                  <LazySendPage />
                ) : (
                  <div className="w-full max-w-md mx-auto bg-dark-900 rounded-2xl p-8 border border-dark-800 text-center">
                    <h2 className="text-xl font-bold mb-4">Connect Your Wallet</h2>
                    <p className="text-dark-400 mb-6">
                      Connect your wallet to send tokens.
                    </p>
                    <Suspense fallback={lazyWalletConnectFallback}>
                      <LazyWalletConnect />
                    </Suspense>
                  </div>
                )}
              </div>

              {/* Balances Sidebar */}
              {isConnected && (
                <Suspense fallback={lazyTokenListSidebarFallback}>
                  <aside className="w-full lg:w-80">
                    <LazyTokenList />
                  </aside>
                </Suspense>
              )}
            </div>
          </Suspense>
        )}

        {currentPage === 'portfolio' && (
          <Suspense fallback={lazyTabFallback}>
            <LazyPortfolioPage
              onSwapToken={handlePortfolioSwapV2}
              onRepeatSwap={handleRepeatSwap}
            />
          </Suspense>
        )}

        {currentPage === 'radar' && (
          <Suspense fallback={lazyTabFallback}>
            <LazyRadarPanel onSignalClick={handleRadarSignalClick} />
          </Suspense>
        )}

        {currentPage === 'screener' && (
          <Suspense fallback={lazyTabFallback}>
            <LazyTokenScreener onSwapSelect={handleScreenerSwapSelect} />
          </Suspense>
        )}

        {/* Static Pages */}
        {currentPage === 'about' && (
          <Suspense fallback={lazyTabFallback}>
            <LazyAboutPage onBack={() => navigate('/')} />
          </Suspense>
        )}
        {currentPage === 'terms' && (
          <Suspense fallback={lazyTabFallback}>
            <LazyTermsPage onBack={() => navigate('/')} />
          </Suspense>
        )}
        {currentPage === 'privacy' && (
          <Suspense fallback={lazyTabFallback}>
            <LazyPrivacyPage onBack={() => navigate('/')} />
          </Suspense>
        )}
        {currentPage === 'disclaimer' && (
          <Suspense fallback={lazyTabFallback}>
            <LazyDisclaimerPage onBack={() => navigate('/')} />
          </Suspense>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] mt-auto bg-electro-bg/40">
        <div className="max-w-6xl mx-auto px-4 py-6 text-center text-sm text-gray-500">
          <p className="text-gray-300 font-medium">Swaperex</p>
          <p className="mt-3 text-xs text-gray-500 leading-relaxed max-w-lg mx-auto">
            {SWAP_SURFACE_COPY.footerTrustCompact}
          </p>
          <div className="mt-3 flex justify-center gap-4">
            <Link
              to="/about"
              className="text-inherit no-underline hover:text-white transition-colors visited:text-inherit"
            >
              About
            </Link>
            <Link
              to="/terms"
              className="text-inherit no-underline hover:text-white transition-colors visited:text-inherit"
            >
              Terms
            </Link>
            <Link
              to="/privacy"
              className="text-inherit no-underline hover:text-white transition-colors visited:text-inherit"
            >
              Privacy
            </Link>
            <Link
              to="/disclaimer"
              className="text-inherit no-underline hover:text-white transition-colors visited:text-inherit"
            >
              Disclaimer
            </Link>
          </div>

          {/* System Status Indicator */}
          <div className="mt-4 pt-3 border-t border-white/[0.04]">
            <SystemStatusIndicator />
          </div>
        </div>
      </footer>

      {/* Global Error Display */}
      <GlobalErrorDisplay />

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  );
}

function NavButton({
  active,
  onClick,
  children,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
        active
          ? 'bg-electro-panel text-white border border-white/[0.08]'
          : 'text-gray-400 hover:text-white hover:bg-electro-panel/50'
      }`}
    >
      {children}
      {badge !== undefined && badge > 0 && (
        <span className="absolute -top-1 -right-1 px-1.5 py-0.5 bg-accent text-electro-bg text-xs font-bold rounded-full min-w-[18px] text-center">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  );
}

