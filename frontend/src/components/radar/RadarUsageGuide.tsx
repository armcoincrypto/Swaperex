/**
 * Radar Usage Guide
 *
 * Small, always-visible guidance block explaining how to use Radar.
 * Sets user mental model immediately.
 *
 * UX Clarity Improvement
 */

export function RadarUsageGuide({ className = '' }: { className?: string }) {
  return (
    <div className={`bg-dark-800/50 border border-dark-700/50 rounded-lg px-4 py-3 ${className}`}>
      <div className="flex items-start gap-3">
        <span className="text-lg flex-shrink-0">🧭</span>
        <div className="text-xs text-dark-400 space-y-1">
          <div className="text-dark-300 font-medium">How to use Radar</div>
          <ul className="space-y-0.5">
            <li>• Add tokens you hold to Watchlist</li>
            <li>• We monitor them automatically</li>
            <li>• You only get alerts when something important changes</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default RadarUsageGuide;
