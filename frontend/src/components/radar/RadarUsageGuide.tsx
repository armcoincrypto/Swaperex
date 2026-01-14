/**
 * Radar Usage Guide
 *
 * Concise, always-visible guidance block explaining how to use Radar.
 * Action-focused with clear steps.
 *
 * UX Clarity Improvement
 * Step 4 - Why Radar Section
 */

export function RadarUsageGuide({ className = '' }: { className?: string }) {
  return (
    <div className={`bg-dark-800/50 border border-dark-700/50 rounded-lg px-4 py-3 ${className}`}>
      <div className="flex items-start gap-3">
        <span className="text-lg flex-shrink-0">📋</span>
        <div className="text-xs text-dark-400">
          <div className="text-dark-300 font-medium mb-1.5">Quick Start</div>
          <ol className="space-y-1 list-decimal list-inside">
            <li><span className="text-dark-300">Check a token</span> — paste any address above</li>
            <li><span className="text-dark-300">Add to Watchlist</span> — click ☆ to auto-monitor</li>
            <li><span className="text-dark-300">Get alerts</span> — we'll notify you of risks</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

export default RadarUsageGuide;
