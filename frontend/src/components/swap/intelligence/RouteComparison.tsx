/**
 * Route Comparison Component
 *
 * Shows best route vs alternatives with savings indicator.
 */

import type { RouteQuote } from '@/services/dex/types';

interface RouteComparisonProps {
  routes: RouteQuote[];
  compact?: boolean;
}

export function RouteComparison({ routes, compact = false }: RouteComparisonProps) {
  if (routes.length === 0) {
    return null;
  }

  const bestRoute = routes[0];
  const alternativeRoutes = routes.slice(1, 3); // Show max 2 alternatives

  // Helper to get output amount from route
  const getOutputAmount = (route: RouteQuote): string => {
    return route.outputAmount || route.amountOutFormatted || '0';
  };

  // Calculate savings vs worst shown route
  const calculateSavings = () => {
    if (routes.length < 2) return null;
    const worstRoute = routes[routes.length > 2 ? 2 : 1];
    const bestOutput = parseFloat(getOutputAmount(bestRoute));
    const worstOutput = parseFloat(getOutputAmount(worstRoute));
    if (worstOutput === 0) return null;
    const savingsPercent = ((bestOutput - worstOutput) / worstOutput) * 100;
    return savingsPercent > 0.01 ? savingsPercent : null;
  };

  const savings = calculateSavings();

  const formatOutput = (amount: string): string => {
    const num = parseFloat(amount);
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(2)}M`;
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(2)}K`;
    }
    if (num >= 1) {
      return num.toFixed(4);
    }
    return num.toFixed(6);
  };

  if (compact) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg border bg-primary-900/20 border-primary-800">
        <RouteIcon className="w-3 h-3 text-primary-400" />
        <span className="text-xs font-medium text-primary-400">
          {bestRoute.dexName}
        </span>
        {savings && (
          <span className="text-xs text-green-400">+{savings.toFixed(2)}%</span>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-dark-800/50 border-dark-700 p-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <RouteIcon className="w-5 h-5 text-primary-400" />
          <span className="text-sm font-medium">Route Comparison</span>
        </div>
        {routes.length > 1 && (
          <span className="text-xs text-dark-400">
            {routes.length} routes found
          </span>
        )}
      </div>

      {/* Best Route */}
      <div className="bg-primary-900/20 border border-primary-800 rounded-lg p-2.5 mb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs bg-primary-600 px-1.5 py-0.5 rounded text-white font-medium">
              BEST
            </span>
            <span className="font-medium text-sm">{bestRoute.dexName}</span>
          </div>
          <span className="text-primary-400 font-bold">
            {formatOutput(getOutputAmount(bestRoute))}
          </span>
        </div>
        {bestRoute.priceImpact !== undefined && (
          <div className="flex items-center gap-4 mt-1.5 text-xs text-dark-400">
            <span>Impact: {bestRoute.priceImpact.toFixed(2)}%</span>
            {bestRoute.estimatedGas && (
              <span>Gas: ~${bestRoute.estimatedGas.toFixed(2)}</span>
            )}
          </div>
        )}
        {savings && (
          <div className="mt-2 pt-2 border-t border-primary-800/50">
            <span className="text-xs text-green-400">
              ✓ Saves {savings.toFixed(2)}% vs other routes
            </span>
          </div>
        )}
      </div>

      {/* Alternative Routes */}
      {alternativeRoutes.length > 0 && (
        <div className="space-y-1.5">
          {alternativeRoutes.map((route, index) => {
            const routeOutput = parseFloat(getOutputAmount(route));
            const bestOutput = parseFloat(getOutputAmount(bestRoute));
            const outputDiff = bestOutput > 0
              ? ((routeOutput - bestOutput) / bestOutput) * 100
              : 0;

            return (
              <div
                key={`${route.dexName || route.provider}-${index}`}
                className="bg-dark-700/50 rounded-lg p-2 flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs text-dark-500">#{index + 2}</span>
                  <span className="text-sm text-dark-300">{route.dexName || route.provider}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-dark-400 text-sm">
                    {formatOutput(getOutputAmount(route))}
                  </span>
                  <span className="text-xs text-red-400">
                    {outputDiff.toFixed(2)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {routes.length === 1 && (
        <p className="text-xs text-dark-500 text-center py-2">
          Only one route available for this pair
        </p>
      )}
    </div>
  );
}

function RouteIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
      />
    </svg>
  );
}

export default RouteComparison;
