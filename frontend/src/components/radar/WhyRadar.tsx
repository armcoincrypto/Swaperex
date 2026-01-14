/**
 * Why Radar Component
 *
 * Explains the value proposition of Radar.
 * Three compelling reasons why users should use it.
 *
 * Step 4 - Why Radar Section
 */

interface WhyRadarProps {
  className?: string;
}

const REASONS = [
  {
    icon: '🛡️',
    title: 'Protect your bags',
    description: 'Get alerted before rugs, honeypots, and liquidity pulls hit your portfolio.',
  },
  {
    icon: '⚡',
    title: 'Know before the crowd',
    description: 'Risk signals fire minutes after on-chain events — faster than social media FUD.',
  },
  {
    icon: '🔕',
    title: 'No spam, only signal',
    description: 'We filter noise so you only see what matters. High confidence, high impact only.',
  },
];

export function WhyRadar({ className = '' }: WhyRadarProps) {
  return (
    <div className={`bg-gradient-to-br from-dark-800 to-dark-800/50 border border-dark-700/50 rounded-xl p-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl">📡</span>
        <h3 className="text-sm font-semibold text-dark-100">Why use Radar?</h3>
      </div>

      {/* Reasons */}
      <div className="space-y-3">
        {REASONS.map((reason, index) => (
          <div key={index} className="flex items-start gap-3">
            <span className="text-lg flex-shrink-0">{reason.icon}</span>
            <div>
              <div className="text-xs font-medium text-dark-200">{reason.title}</div>
              <div className="text-[11px] text-dark-400 leading-relaxed">
                {reason.description}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div className="mt-4 pt-3 border-t border-dark-700/50">
        <p className="text-[10px] text-dark-500 text-center">
          Add tokens to your Watchlist to start monitoring
        </p>
      </div>
    </div>
  );
}

/**
 * Compact inline version for tight spaces
 */
export function WhyRadarCompact({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-4 text-[10px] text-dark-400 ${className}`}>
      <span className="flex items-center gap-1">
        <span>🛡️</span>
        <span>Rug protection</span>
      </span>
      <span className="flex items-center gap-1">
        <span>⚡</span>
        <span>Fast alerts</span>
      </span>
      <span className="flex items-center gap-1">
        <span>🔕</span>
        <span>No spam</span>
      </span>
    </div>
  );
}

export default WhyRadar;
