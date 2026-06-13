import { lazy } from 'react';

export const LazyTradingIntelligencePanel = lazy(() =>
  import('@/components/swap/intelligence/SwapIntelligenceCenter').then((m) => ({
    default: m.SwapIntelligenceCenter,
  })),
);
