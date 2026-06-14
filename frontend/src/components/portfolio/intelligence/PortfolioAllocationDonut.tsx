/**
 * P3.9 — SVG allocation donut (stablecoins / majors / long-tail).
 * No chart libraries; uses composition buckets from intelligence model.
 */

import type { CompositionBucket } from './portfolioIntelligenceModel';
import { formatPercent } from './portfolioIntelligenceModel';

interface Props {
  buckets: CompositionBucket[];
  privacyMode: boolean;
  size?: number;
}

const SLICE_COLORS: Record<'stablecoins' | 'major' | 'longtail', string> = {
  stablecoins: '#34d399',
  major: '#2eff8b',
  longtail: '#a78bfa',
};

const SLICE_LABELS: Record<'stablecoins' | 'major' | 'longtail', string> = {
  stablecoins: 'Stablecoins',
  major: 'Majors',
  longtail: 'Long-tail',
};

function donutSlice(
  cx: number,
  cy: number,
  r: number,
  ir: number,
  startAngle: number,
  endAngle: number,
): string {
  const large = endAngle - startAngle > Math.PI ? 1 : 0;
  const x1 = cx + r * Math.cos(startAngle);
  const y1 = cy + r * Math.sin(startAngle);
  const x2 = cx + r * Math.cos(endAngle);
  const y2 = cy + r * Math.sin(endAngle);
  const ix1 = cx + ir * Math.cos(endAngle);
  const iy1 = cy + ir * Math.sin(endAngle);
  const ix2 = cx + ir * Math.cos(startAngle);
  const iy2 = cy + ir * Math.sin(startAngle);

  return [
    `M ${x1} ${y1}`,
    `A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`,
    `L ${ix1} ${iy1}`,
    `A ${ir} ${ir} 0 ${large} 0 ${ix2} ${iy2}`,
    'Z',
  ].join(' ');
}

export function PortfolioAllocationDonut({ buckets, privacyMode, size = 120 }: Props) {
  const sliceIds: Array<'stablecoins' | 'major' | 'longtail'> = [
    'stablecoins',
    'major',
    'longtail',
  ];

  const slices = sliceIds
    .map((id) => buckets.find((b) => b.id === id))
    .filter((b): b is CompositionBucket => !!b && b.percent > 0);

  const totalPercent = slices.reduce((s, b) => s + b.percent, 0);
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.42;
  const ir = size * 0.28;

  let angle = -Math.PI / 2;

  const paths = slices.map((bucket) => {
    const id = bucket.id as 'stablecoins' | 'major' | 'longtail';
    const sweep = totalPercent > 0 ? (bucket.percent / totalPercent) * Math.PI * 2 : 0;
    const start = angle;
    angle += sweep;
    return {
      id,
      d: donutSlice(cx, cy, r, ir, start, angle),
      color: SLICE_COLORS[id],
      percent: bucket.percent,
    };
  });

  if (privacyMode || slices.length === 0 || totalPercent <= 0) {
    return (
      <div className="flex flex-col items-center justify-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={r - ir}
          />
        </svg>
        <p className="text-[10px] text-dark-500 mt-1 text-center">
          {privacyMode ? 'Hidden' : 'No allocation'}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label="Portfolio allocation by stablecoins, majors, and long-tail"
      >
        {paths.map((p) => (
          <path
            key={p.id}
            d={p.d}
            fill={p.color}
            fillOpacity={0.85}
            className="transition-opacity hover:fill-opacity-100"
          />
        ))}
        <circle cx={cx} cy={cy} r={ir - 1} fill="rgba(10,12,16,0.92)" />
        <text
          x={cx}
          y={cy - 2}
          textAnchor="middle"
          className="fill-white text-[11px] font-bold"
          style={{ fontSize: size * 0.11 }}
        >
          {Math.round(totalPercent)}%
        </text>
        <text
          x={cx}
          y={cy + size * 0.1}
          textAnchor="middle"
          className="fill-dark-500"
          style={{ fontSize: size * 0.07 }}
        >
          allocated
        </text>
      </svg>
      <ul className="mt-2 space-y-1 w-full">
        {sliceIds.map((id) => {
          const bucket = buckets.find((b) => b.id === id);
          if (!bucket || bucket.percent <= 0) return null;
          return (
            <li key={id} className="flex items-center justify-between gap-2 text-[10px]">
              <span className="flex items-center gap-1.5 text-dark-400 min-w-0">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: SLICE_COLORS[id] }}
                />
                <span className="truncate">{SLICE_LABELS[id]}</span>
              </span>
              <span className="text-dark-300 tabular-nums shrink-0">
                {formatPercent(bucket.percent, false)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default PortfolioAllocationDonut;
