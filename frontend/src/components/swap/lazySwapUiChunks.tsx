import { lazy } from 'react';

const popularCommissionRoutesLoader = () => import('./PopularCommissionRoutes');

/** Shared async chunk for commission route recovery UI (display-only). */
export const LazyCommissionRouteRecoveryPanel = lazy(() =>
  popularCommissionRoutesLoader().then((m) => ({ default: m.CommissionRouteRecoveryPanel })),
);

export const LazyCommissionRouteRecoveryChips = lazy(() =>
  popularCommissionRoutesLoader().then((m) => ({ default: m.CommissionRouteRecoveryChips })),
);

export const LazySwapPreviewModal = lazy(() =>
  import('./SwapPreviewModal').then((m) => ({ default: m.SwapPreviewModal })),
);
