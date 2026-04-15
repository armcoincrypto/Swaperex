import { lazy } from 'react';

const walletConnectLoader = () =>
  import('@/components/wallet/WalletConnect').then((m) => ({ default: m.WalletConnect }));

/** Single lazy factory so header + send gate share one async chunk. */
export const LazyWalletConnect = lazy(walletConnectLoader);

export const LazyWalletBootstrap = lazy(() => import('@/components/wallet/WalletBootstrap'));
