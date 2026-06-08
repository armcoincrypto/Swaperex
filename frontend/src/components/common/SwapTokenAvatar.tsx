/**
 * SwapTokenAvatar — presentation-only token identity for swap surfaces.
 * Uses caller-provided logoUrl only (no external fetch).
 */

import { useEffect, useMemo, useState } from 'react';

export type SwapTokenAvatarSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE: Record<
  SwapTokenAvatarSize,
  { box: string; text: string; ring: string; chain: string }
> = {
  sm: {
    box: 'w-6 h-6',
    text: 'text-[9px]',
    ring: 'ring-1',
    chain: 'text-[7px] px-0.5 min-w-[0.875rem]',
  },
  md: {
    box: 'w-8 h-8',
    text: 'text-[10px]',
    ring: 'ring-1',
    chain: 'text-[8px] px-1 min-w-[1rem]',
  },
  lg: {
    box: 'w-10 h-10',
    text: 'text-xs',
    ring: 'ring-1',
    chain: 'text-[9px] px-1 min-w-[1.125rem]',
  },
  xl: {
    box: 'w-12 h-12',
    text: 'text-sm',
    ring: 'ring-2',
    chain: 'text-[9px] px-1 min-w-[1.125rem]',
  },
};

function fallbackLetters(symbol?: string): string {
  const s = (symbol ?? '').trim().toUpperCase();
  if (!s) return '?';
  if (s.length === 1) return s;
  return s.slice(0, 2);
}

function symbolAccentHue(symbol?: string): number {
  const s = (symbol ?? '?').trim().toUpperCase();
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h % 360;
}

function chainShortLabel(chainId?: number, chainName?: string): string | null {
  if (chainName?.trim()) {
    const n = chainName.trim();
    return n.length <= 4 ? n.toUpperCase() : n.slice(0, 3).toUpperCase();
  }
  if (chainId == null) return null;
  switch (chainId) {
    case 1:
      return 'ETH';
    case 56:
      return 'BSC';
    case 137:
      return 'POL';
    case 42161:
      return 'ARB';
    case 10:
      return 'OP';
    case 8453:
      return 'BASE';
    default:
      return String(chainId);
  }
}

export interface SwapTokenAvatarProps {
  symbol?: string;
  logoUrl?: string;
  chainId?: number;
  chainName?: string;
  size?: SwapTokenAvatarSize;
  className?: string;
  /** Receive-side emphasis in preview/summary rows */
  variant?: 'default' | 'accent';
  /** Optional corner chain chip (off by default on compact swap rows) */
  showChainBadge?: boolean;
}

export function SwapTokenAvatar({
  symbol,
  logoUrl,
  chainId,
  chainName,
  size = 'md',
  className = '',
  variant = 'default',
  showChainBadge = false,
}: SwapTokenAvatarProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const dims = SIZE[size];
  const letters = useMemo(() => fallbackLetters(symbol), [symbol]);
  const hue = useMemo(() => symbolAccentHue(symbol), [symbol]);
  const chainLabel = showChainBadge ? chainShortLabel(chainId, chainName) : null;

  useEffect(() => {
    setImgFailed(false);
  }, [logoUrl, symbol]);

  const shellClass =
    variant === 'accent'
      ? 'bg-primary-950/50 ring-primary-500/35 shadow-[0_0_0_1px_rgba(16,185,129,0.08)]'
      : 'bg-electro-panel/70 ring-white/[0.12] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]';

  const showImage = Boolean(logoUrl && !imgFailed);

  return (
    <span
      className={`relative inline-flex flex-shrink-0 ${dims.box} ${className}`}
      aria-hidden={!symbol}
    >
      <span
        className={`${dims.box} ${dims.ring} rounded-full overflow-hidden flex items-center justify-center ${shellClass}`}
      >
        {showImage ? (
          <img
            src={logoUrl}
            alt=""
            width={48}
            height={48}
            loading="lazy"
            decoding="async"
            className={`${dims.box} object-cover`}
            onError={() => setImgFailed(true)}
          />
        ) : (
          <span
            className={`${dims.text} font-bold leading-none tracking-tight text-white/90 select-none`}
            style={{
              background: `linear-gradient(135deg, hsl(${hue} 48% 38%) 0%, hsl(${(hue + 36) % 360} 42% 28%) 100%)`,
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {letters}
          </span>
        )}
      </span>
      {chainLabel ? (
        <span
          className={`absolute -bottom-0.5 -right-0.5 rounded-full bg-dark-950/95 text-dark-200 font-semibold leading-none py-0.5 ring-1 ring-white/15 ${dims.chain}`}
          title={chainName ?? (chainId != null ? `Chain ${chainId}` : undefined)}
        >
          {chainLabel}
        </span>
      ) : null}
    </span>
  );
}

export default SwapTokenAvatar;
