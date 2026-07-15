/**
 * P8A.3 — Trade shell (former DexMain).
 *
 * Loaded lazily from App for non-passive routes.
 * SwapInterface remains a STATIC import here — do NOT lazy-load it from App.
 * SECURITY: All signing happens client-side via connected wallet.
 */

import { useState, useEffect, useCallback, useRef, lazy, Suspense, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LazyWalletBootstrap, LazyWalletConnect } from '@/components/wallet/lazyWalletChunks';
import { SwapInterface } from '@/components/swap/SwapInterface';
import { ChainWarningBanner } from '@/components/chain/ChainWarning';
import { ToastContainer } from '@/components/common/Toast';
import { GlobalErrorDisplay } from '@/components/common/GlobalErrorDisplay';
import { NetworkSelector } from '@/components/common/NetworkSelector';
import { useWallet } from '@/hooks/useWallet';
import { useSwapStore } from '@/stores/swapStore';
import { useToastStore } from '@/stores/toastStore';
import { useRadarStore, type RadarSignal } from '@/stores/radarStore';
import { useSignalsHealthStore } from '@/stores/signalsHealthStore';
import { useSystemStatusStore } from '@/stores/systemStatusStore';
import { type SwapRecord } from '@/stores/swapHistoryStore';
import type { AssetInfo } from '@/types/api';
import { getTokenBySymbol } from '@/tokens';
import { useWalletBootstrapStore } from '@/stores/walletBootstrapStore';
import {
  hasWalletConnectStorageHint,
  subscribeWalletBootstrapRequest,
} from '@/services/wallet/appKitActionsRegistry';
import { SHOW_OPTIONAL_PRIMARY_NAV, PRIMARY_NAV_ITEMS, TRADE_SUB_NAV } from '@/config/productShell';
import {
  type AppPage,
  pathToPage,
  pageToPath,
  isKnownPublicPath,
  APP_ROUTE_PATHS,
} from '@/config/appRoutes';
import { BRAND } from '@/constants/brand';
import { applyClientRouteSeo, normalizePublicPath } from '@/utils/routeSeo';
import { DexSiteFooter, type FooterNavTarget } from '@/components/layout/DexSiteFooter';
import { HomepageTrustStrip } from '@/components/homepage/HomepageTrustStrip';
import { HomepageHeroWorkspace } from '@/components/homepage/HomepageHeroWorkspace';
import { HomepageProtocolStats } from '@/components/homepage/HomepageProtocolStats';
import { HomepageWhySwaperex } from '@/components/homepage/HomepageWhySwaperex';
import { HomepagePopularRoutes } from '@/components/homepage/HomepagePopularRoutes';
import { useSwapUrlSync } from '@/hooks/useSwapUrlSync';

const LazySendPage = lazy(() => import('@/components/send/SendPage'));
const LazyPortfolioPage = lazy(() => import('@/components/portfolio/PortfolioPage'));
const LazyTokenScreener = lazy(() => import('@/components/screener/TokenScreener'));
const LazyRadarPanel = lazy(() => import('@/components/radar/RadarPanel'));

const LazyTokenList = lazy(() =>
  import('@/components/balances/TokenList').then((m) => ({ default: m.TokenList }))
);
const LazyDexLearnMoreSection = lazy(() =>
  import('@/components/seo/DexLearnMoreSection').then((m) => ({ default: m.DexLearnMoreSection }))
);
const LazyTradingIntelligencePanel = lazy(() =>
  import('@/components/trading/TradingIntelligencePanel').then((m) => ({
    default: m.TradingIntelligencePanel,
  })),
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

/** Trading intelligence sidebar — lazy, display-only. */
const lazyTradingIntelFallback = (
  <div className="space-y-3" aria-hidden>
    <div className="h-28 rounded-xl bg-dark-800/60 animate-pulse" />
    <div className="h-36 rounded-xl bg-dark-800/50 animate-pulse" />
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

type Page = AppPage;

/**
 * P16 — Derive active page from URL (first-class routes for all trade tabs).
 */
function readPageFromUrl(pathname: string): Page {
  return pathToPage(pathname) ?? 'swap';
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

export default function TradeShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const currentPage = useMemo(() => readPageFromUrl(location.pathname), [location.pathname]);
  const onSwapRoute =
    currentPage === 'swap' &&
    (normalizePublicPath(location.pathname) === '/' ||
      normalizePublicPath(location.pathname) === APP_ROUTE_PATHS.swap);
  useSwapUrlSync(onSwapRoute);
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

  // P16 — Legacy PassiveShell footer handoff: navigate to real route + optional section hash.
  useEffect(() => {
    const state = location.state as { dexPage?: Page; section?: string } | null;
    if (!state?.dexPage) return;
    const path = pageToPath(state.dexPage);
    const hash = state.section ? `#${state.section}` : '';
    navigate(`${path}${hash}`, { replace: true, state: null });
    if (state.section) {
      requestAnimationFrame(() => {
        window.dispatchEvent(
          new CustomEvent('swaperex:section', { detail: { page: state.dexPage, section: state.section } }),
        );
      });
    }
  }, [location.state, navigate]);

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

  // P7.4 — reveal SEO on scroll intent (IO + scrollY > 0) or after 8s for crawlers; ignore cold in-viewport IO.
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
          if (
            entries.some((entry) => entry.isIntersecting) &&
            window.scrollY > 0
          ) {
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
    (page: Page, section?: string) => {
      const path = pageToPath(page);
      const hash = section ? `#${section}` : location.hash && page === currentPage ? location.hash : '';
      navigate(`${path}${hash}`);
      if (section) {
        requestAnimationFrame(() => {
          window.dispatchEvent(
            new CustomEvent('swaperex:section', { detail: { page, section } }),
          );
        });
      }
    },
    [navigate, location.hash, currentPage],
  );

  const handleFooterNavigate = useCallback(
    (target: FooterNavTarget) => {
      goToPage(target.page as Page, target.section);
    },
    [goToPage],
  );

  /**
   * P16 — Unknown paths redirect to /swap; informational routes are served by PassiveShell in App.
   */
  useEffect(() => {
    const p = normalizePublicPath(location.pathname);
    if (!isKnownPublicPath(p)) {
      navigate(APP_ROUTE_PATHS.swap, { replace: true });
    }
  }, [location.pathname, navigate]);

  /** P16 — Section deep-links via URL hash */
  useEffect(() => {
    const hash = location.hash.replace(/^#/, '');
    if (!hash || !currentPage) return;
    requestAnimationFrame(() => {
      window.dispatchEvent(
        new CustomEvent('swaperex:section', { detail: { page: currentPage, section: hash } }),
      );
    });
  }, [location.hash, currentPage]);

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
    const allowed: Page[] = ['swap', 'send', 'portfolio', 'radar', 'screener'];
    const onNav = (event: Event) => {
      const detail = (event as CustomEvent<{ page?: string }>).detail;
      const target = detail?.page;
      if (target && (allowed as string[]).includes(target)) {
        goToPage(target as Page);
      } else if (
        target === 'about' ||
        target === 'terms' ||
        target === 'privacy' ||
        target === 'disclaimer' ||
        target === 'trust'
      ) {
        navigate(pageToPath(target as Page));
      }
    };
    window.addEventListener('swaperex:navigate', onNav as EventListener);
    return () => window.removeEventListener('swaperex:navigate', onNav as EventListener);
  }, [goToPage, navigate]);

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

  const handleTradingPairSelect = useCallback(
    (from: AssetInfo, to: AssetInfo) => {
      setFromAsset(from);
      setToAsset(to);
      setFromAmount('');
      goToPage('swap');
    },
    [setFromAsset, setToAsset, setFromAmount, goToPage],
  );

  return (
    <div className="min-h-screen bg-electro-bg bg-bg-mesh overflow-x-hidden flex flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom))] sm:pb-[env(safe-area-inset-bottom)]">
      {walletHostNeeded && (
        <Suspense fallback={null}>
          <LazyWalletBootstrap />
        </Suspense>
      )}
      {/* Header — P19: wallet action always stays in-viewport; page nav moves to bottom on mobile */}
      <header className="border-b border-white/[0.06] backdrop-blur-sm bg-electro-bg/80 sticky top-0 z-40 pt-[env(safe-area-inset-top)]">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-3 sm:py-4 flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-3 sm:gap-8 min-w-0">
            {/* Logo — P16 brand hierarchy */}
            <div className="flex flex-col leading-tight shrink-0">
              <h1 className="text-lg sm:text-xl font-bold text-accent">{BRAND.displayName}</h1>
              <span className="hidden sm:inline text-[10px] font-medium text-dark-500 tracking-wide">
                {BRAND.byline}
              </span>
            </div>

            {/* Navigation — desktop command center only (mobile uses bottom nav) */}
            <nav className="hidden sm:flex gap-1" aria-label="Primary">
              <NavButton
                active={currentPage === 'swap' || currentPage === 'send'}
                onClick={() => goToPage('swap')}
              >
                Trade
              </NavButton>
              {SHOW_OPTIONAL_PRIMARY_NAV &&
                PRIMARY_NAV_ITEMS.filter((item) => item.page !== 'swap').map((item) => (
                  <NavButton
                    key={item.page}
                    active={(item.activeWhen as Page[]).includes(currentPage)}
                    onClick={() => goToPage(item.page)}
                    badge={item.page === 'radar' && radarUnreadCount > 0 ? radarUnreadCount : undefined}
                  >
                    {item.label}
                  </NavButton>
                ))}
            </nav>
          </div>

          {/* Network + wallet — shrink-0 so Connect cannot be pushed off-screen (P19) */}
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
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
                className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] h-11 px-3 sm:px-4 rounded-lg border border-white/[0.08] bg-electro-panel/50 text-sm font-medium text-dark-300 hover:text-white hover:bg-electro-panel transition-colors"
                aria-label="Open Trade to connect wallet"
              >
                <span className="sm:hidden">Wallet</span>
                <span className="hidden sm:inline">Wallet</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Trade sub-nav — Swap / Send under Command Center Trade */}
      {(currentPage === 'swap' || currentPage === 'send') && (
        <div className="border-b border-white/[0.06] bg-electro-bg/60 backdrop-blur-sm">
          <div className="max-w-6xl mx-auto px-4 py-2">
            <div className="shell-segment-track inline-flex">
              {TRADE_SUB_NAV.map(({ page, label }) => (
                <button
                  key={page}
                  type="button"
                  onClick={() => goToPage(page)}
                  className={`shell-segment ${currentPage === page ? 'shell-segment-active' : ''}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Chain Warning Banner */}
      {isConnected && isWrongChain && !isReadOnly && (!bannerDismissed || currentPage === 'swap') && (
        <ChainWarningBanner
          chainId={chainId}
          onSwitch={handleBannerSwitch}
          onDismiss={currentPage === 'swap' ? undefined : () => setBannerDismissed(true)}
          allowDismiss={currentPage !== 'swap'}
        />
      )}

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-8 sm:py-10 min-w-0 w-full flex-1">
        {currentPage === 'swap' && (
          <>
            <HomepageTrustStrip />
            <div className="flex flex-col lg:flex-row gap-10 lg:items-start">
              {/* Swap Panel + optional intelligence strip when disconnected */}
              <HomepageHeroWorkspace>
                <div className="flex-1 flex flex-col min-w-0 gap-4">
                  <div
                    className={`homepage-swap-panel-ring flex min-w-0 justify-center ${
                      isConnected ? 'lg:justify-start' : ''
                    }`}
                  >
                    <SwapInterface />
                  </div>
                  {!isConnected && (
                    <Suspense fallback={lazyTradingIntelFallback}>
                      <LazyTradingIntelligencePanel
                        activeChainId={chainId ?? 1}
                        onSelectPair={handleTradingPairSelect}
                        layout="strip"
                      />
                    </Suspense>
                  )}
                </div>
              </HomepageHeroWorkspace>

              {/* Sidebar: balances + trading intelligence when connected */}
              {isConnected && (
                <aside className="w-full lg:w-80 space-y-4">
                  <Suspense fallback={lazyTokenListSidebarFallback}>
                    <LazyTokenList />
                  </Suspense>
                  <Suspense fallback={lazyTradingIntelFallback}>
                    <LazyTradingIntelligencePanel
                      activeChainId={chainId ?? 1}
                      onSelectPair={handleTradingPairSelect}
                      layout="sidebar"
                    />
                  </Suspense>
                </aside>
              )}
            </div>
            <HomepageProtocolStats />
            <HomepageWhySwaperex />
            <HomepagePopularRoutes activeChainId={chainId ?? 1} />
            <div ref={belowFoldSeoSentinelRef} className="h-px w-full" aria-hidden />
            {showBelowFoldSeo && (
              <Suspense fallback={lazySwapEducationFallback}>
                <LazyDexLearnMoreSection />
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
      </main>

      {/* Footer — P5.4 professional DEX site footer */}
      <DexSiteFooter onNavigate={handleFooterNavigate} />

      {/* P19 — Mobile bottom command nav (keeps header free for wallet connect) */}
      <nav
        className="sm:hidden fixed bottom-0 inset-x-0 z-40 border-t border-white/[0.08] bg-electro-bg/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]"
        aria-label="Primary mobile"
      >
        <div className="grid grid-cols-4 gap-0.5 px-1 pt-1">
          {(
            [
              {
                page: 'swap' as Page,
                label: 'Trade',
                active: currentPage === 'swap' || currentPage === 'send',
                badge: 0,
              },
              ...(SHOW_OPTIONAL_PRIMARY_NAV
                ? PRIMARY_NAV_ITEMS.filter((i) => i.page !== 'swap').map((i) => ({
                    page: i.page as Page,
                    label: i.label,
                    active: (i.activeWhen as Page[]).includes(currentPage),
                    badge: i.page === 'radar' ? radarUnreadCount : 0,
                  }))
                : []),
            ] as Array<{ page: Page; label: string; active: boolean; badge: number }>
          ).map(({ page, label, active, badge }) => (
            <button
              key={page}
              type="button"
              onClick={() => goToPage(page)}
              aria-current={active ? 'page' : undefined}
              className={`relative flex flex-col items-center justify-center min-h-[48px] rounded-lg text-[11px] font-medium transition-colors ${
                active ? 'text-white bg-electro-panel border border-white/[0.08]' : 'text-dark-400'
              }`}
            >
              {label}
              {badge > 0 && (
                <span className="absolute top-1 right-2 min-w-[14px] h-[14px] px-0.5 bg-accent text-electro-bg text-[9px] font-bold rounded-full flex items-center justify-center">
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </nav>

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

