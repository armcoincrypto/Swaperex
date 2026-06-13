import { useEffect, useState } from 'react';
import type { AssetInfo } from '@/types/api';
import { ShellPanel } from '@/components/ui/ShellPrimitives';
import { SwapTokenAvatar } from '@/components/common/SwapTokenAvatar';
import {
  fetchSwapTokenSafetySignals,
  statusColorClasses,
  statusDotClass,
  type SwapTokenSafetySignal,
} from './swapTokenSafetyModel';

interface Props {
  token: AssetInfo | null;
  chainId: number;
}

export function TokenSafetyPanel({ token, chainId }: Props) {
  const [signals, setSignals] = useState<SwapTokenSafetySignal[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      setSignals(null);
      return;
    }

    if (token.is_native) {
      setSignals(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void fetchSwapTokenSafetySignals({
      chainId,
      contractAddress: token.contract_address,
      isNative: token.is_native,
    }).then((result) => {
      if (!cancelled) {
        setSignals(result);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [token?.symbol, token?.contract_address, token?.is_native, chainId]);

  return (
    <ShellPanel className="p-3 sm:p-4">
      <div className="flex items-center gap-2 mb-2">
        {token ? (
          <SwapTokenAvatar symbol={token.symbol} logoUrl={token.logo_url} size="sm" />
        ) : null}
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-dark-500">Token Safety</p>
          <p className="text-xs font-medium text-white truncate">
            {token ? `${token.symbol} receive-side` : 'Select a receive token'}
          </p>
        </div>
      </div>
      <p className="text-[10px] text-dark-500 mb-2.5 leading-snug">
        Radar-style checks via GoPlus when available · not financial advice
      </p>

      {loading && (
        <div className="space-y-1.5 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 rounded-lg bg-electro-panel/40 border border-white/[0.04]" />
          ))}
        </div>
      )}

      {!loading && !token && (
        <p className="text-xs text-dark-500 py-2">Choose a receive token to review safety signals.</p>
      )}

      {!loading && token?.is_native && (
        <p className="text-xs text-dark-400 py-2 rounded-lg border border-white/[0.06] bg-black/20 px-2.5">
          Native asset — contract safety checks not applicable.
        </p>
      )}

      {!loading && token && !token.is_native && !signals && (
        <p className="text-xs text-dark-400 py-2 rounded-lg border border-white/[0.06] bg-black/20 px-2.5">
          Safety data unavailable.
        </p>
      )}

      {!loading && signals && signals.length > 0 && (
        <ul className="space-y-1.5">
          {signals.map((signal) => (
            <li
              key={signal.id}
              className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 text-[11px] ${statusColorClasses(signal.status)}`}
            >
              <span
                className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${statusDotClass(signal.status)}`}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <span className="font-medium">{signal.label}</span>
                <p className="text-dark-400 mt-0.5 leading-snug">{signal.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </ShellPanel>
  );
}
