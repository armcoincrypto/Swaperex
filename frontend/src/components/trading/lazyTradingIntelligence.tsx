import { lazy } from 'react';

export const LazyTradingIntelligencePanel = lazy(() =>
  import('./TradingIntelligencePanel').then((m) => ({ default: m.TradingIntelligencePanel })),
);
