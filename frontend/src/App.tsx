/**
 * Main Application Component — route shell only (P8A.3).
 *
 * Passive routes: wallet-free PassiveShell.
 * Trade routes: lazy TradeShell (swap/wallet graph lives entirely in that chunk).
 * Admin: unchanged lazy AdminApp.
 *
 * Hard rule: this file must stay free of wallet/swap module imports.
 */

import { lazy, Suspense } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { PassiveShell } from '@/components/layout/PassiveShell';

const LazyAdminApp = lazy(() => import('@/components/admin/AdminApp'));
const LazyTradeShell = lazy(() => import('@/components/layout/TradeShell'));

const LazyAboutPage = lazy(() =>
  import('@/components/pages/StaticPages').then((m) => ({ default: m.AboutPage })),
);
const LazyTermsPage = lazy(() =>
  import('@/components/pages/StaticPages').then((m) => ({ default: m.TermsPage })),
);
const LazyPrivacyPage = lazy(() =>
  import('@/components/pages/StaticPages').then((m) => ({ default: m.PrivacyPage })),
);
const LazyDisclaimerPage = lazy(() =>
  import('@/components/pages/StaticPages').then((m) => ({ default: m.DisclaimerPage })),
);
const LazyTrustCenterPage = lazy(() =>
  import('@/components/pages/TrustCenterPage').then((m) => ({ default: m.TrustCenterPage })),
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

/** Wallet-free suspense placeholder while TradeShell chunk loads. */
const lazyTradeShellFallback = (
  <div className="min-h-screen bg-electro-bg bg-bg-mesh flex items-center justify-center">
    <p className="text-sm text-dark-400">Loading…</p>
  </div>
);

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
      <Route path="/trust" element={<PassiveRoute Page={LazyTrustCenterPage} />} />
      <Route path="/about" element={<PassiveRoute Page={LazyAboutPage} />} />
      <Route path="/terms" element={<PassiveRoute Page={LazyTermsPage} />} />
      <Route path="/privacy" element={<PassiveRoute Page={LazyPrivacyPage} />} />
      <Route path="/disclaimer" element={<PassiveRoute Page={LazyDisclaimerPage} />} />
      <Route
        path="/*"
        element={
          <Suspense fallback={lazyTradeShellFallback}>
            <LazyTradeShell />
          </Suspense>
        }
      />
    </Routes>
  );
}

function PassiveRoute({
  Page,
}: {
  Page: React.LazyExoticComponent<React.ComponentType<{ onBack: () => void }>>;
}) {
  const navigate = useNavigate();
  return (
    <PassiveShell>
      <Suspense fallback={lazyTabFallback}>
        <Page onBack={() => navigate('/')} />
      </Suspense>
    </PassiveShell>
  );
}
