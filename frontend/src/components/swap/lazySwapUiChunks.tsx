import { lazy } from 'react';

const popularCommissionRoutesLoader = () => import('./PopularCommissionRoutes');

/** Shared async chunk for audited route shortcuts + recovery UI (display-only). */
export const LazyPopularCommissionRoutes = lazy(() =>
  popularCommissionRoutesLoader().then((m) => ({ default: m.PopularCommissionRoutes })),
);

export const LazyCommissionRouteRecoveryPanel = lazy(() =>
  popularCommissionRoutesLoader().then((m) => ({ default: m.CommissionRouteRecoveryPanel })),
);

export const LazyCommissionRouteRecoveryChips = lazy(() =>
  popularCommissionRoutesLoader().then((m) => ({ default: m.CommissionRouteRecoveryChips })),
);

export const LazySwapPreviewModal = lazy(() =>
  import('./SwapPreviewModal').then((m) => ({ default: m.SwapPreviewModal })),
);
