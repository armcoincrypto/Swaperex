import { useRadarStore } from '@/stores/radarStore';
import { useWatchlistStore } from '@/stores/watchlistStore';
import { ShellPanel } from '@/components/ui/ShellPrimitives';

export function PortfolioSecurityCard() {
  const unreadAlerts = useRadarStore((s) => s.signals.filter((sig) => !sig.read).length);
  const watchlistCount = useWatchlistStore((s) => s.tokens.length);

  let statusLine = 'Radar can monitor selected tokens';
  let detailLine = 'Add tokens to your watchlist on the Radar page.';

  if (unreadAlerts > 0) {
    statusLine = `${unreadAlerts} local alert${unreadAlerts !== 1 ? 's' : ''} on this device`;
    detailLine = 'Review signals on Radar — stored locally, not on-chain proof.';
  } else if (watchlistCount > 0) {
    statusLine = `Monitoring ${watchlistCount} watchlist token${watchlistCount !== 1 ? 's' : ''}`;
    detailLine = 'No unread local alerts right now.';
  }

  return (
    <ShellPanel className="p-3 sm:p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-electro-panel/60 text-lg">
          🛡
        </div>
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-dark-500">Portfolio Security</p>
          <p className="text-sm font-semibold text-white mt-0.5">{statusLine}</p>
          <p className="text-[11px] text-dark-400 mt-1 leading-snug">{detailLine}</p>
        </div>
      </div>
    </ShellPanel>
  );
}
