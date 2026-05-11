/**
 * Isolated admin SPA shell (/admin). Token in sessionStorage only (P2.1).
 * Overview, Events (P2.2), Swaps analytics (P2.3), Revenue (P2.4), Wallet reconnect (P2.5).
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { NavLink, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import {
  clearStoredAdminToken,
  fetchAdminEvents,
  fetchAdminHealth,
  fetchAdminOverview,
  fetchAdminRevenue,
  fetchAdminSwaps,
  fetchAdminWalletReconnect,
  getStoredAdminToken,
  setStoredAdminToken,
  type AdminEventsBatchItem,
  type AdminEventsResponse,
  type AdminOverviewResponse,
  type AdminRevenueResponse,
  type AdminRevenueRouteBucket,
  type AdminSwapAnalyticsRow,
  type AdminSwapsResponse,
  type AdminWalletReconnectFailureRow,
  type AdminWalletReconnectResponse,
  type AdminWalletReconnectSessionRow,
} from '@/admin/adminApi';

const AdminTokenContext = createContext<{
  token: string;
  logout: () => void;
} | null>(null);

export function useAdminToken() {
  const ctx = useContext(AdminTokenContext);
  if (!ctx) throw new Error('useAdminToken outside provider');
  return ctx;
}

function AdminUnlock() {
  const [secret, setSecret] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const unlock = useCallback(async () => {
    setErr(null);
    const t = secret.trim();
    if (!t) {
      setErr('Enter the admin token.');
      return;
    }
    setChecking(true);
    try {
      await fetchAdminHealth(t);
      setStoredAdminToken(t);
      window.location.reload();
    } catch {
      setErr('Invalid token or admin API unreachable.');
    } finally {
      setChecking(false);
    }
  }, [secret]);

  return (
    <div className="min-h-screen bg-dark-950 text-white flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-dark-700 bg-dark-900/80 p-8 shadow-xl">
        <h1 className="text-xl font-semibold text-accent mb-1">Swaperex Admin</h1>
        <p className="text-sm text-dark-400 mb-6">Enter operator token to continue. Stored for this tab only.</p>
        <label className="block text-xs text-dark-500 mb-2 uppercase tracking-wide">X-Admin-Token</label>
        <input
          type="password"
          autoComplete="off"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void unlock()}
          className="w-full rounded-lg bg-dark-800 border border-dark-600 px-3 py-2.5 text-sm focus:border-accent outline-none"
          placeholder="Admin API token"
        />
        {err && <p className="mt-3 text-sm text-red-400">{err}</p>}
        <button
          type="button"
          disabled={checking}
          onClick={() => void unlock()}
          className="mt-6 w-full rounded-lg bg-accent text-electro-bg font-medium py-2.5 disabled:opacity-50"
        >
          {checking ? 'Checking…' : 'Unlock'}
        </button>
        <p className="mt-6 text-xs text-dark-500 text-center">
          <NavLink to="/" className="text-dark-300 hover:text-white">
            ← Back to app
          </NavLink>
        </p>
      </div>
    </div>
  );
}

const navCls = ({ isActive }: { isActive: boolean }) =>
  `block px-3 py-2 rounded-lg text-sm ${isActive ? 'bg-dark-700 text-white' : 'text-dark-400 hover:text-white hover:bg-dark-800/80'}`;

function AdminLayout() {
  const { logout } = useAdminToken();

  return (
    <div className="min-h-screen bg-dark-950 text-white flex">
      <aside className="w-56 shrink-0 border-r border-dark-800 bg-dark-900/50 p-4 flex flex-col">
        <div className="font-semibold text-accent mb-6">Admin</div>
        <nav className="flex flex-col gap-1">
          <NavLink to="/admin" end className={navCls}>
            Overview
          </NavLink>
          <NavLink to="/admin/events" className={navCls}>
            Events
          </NavLink>
          <NavLink to="/admin/swaps" className={navCls}>
            Swaps
          </NavLink>
          <NavLink to="/admin/revenue" className={navCls}>
            Revenue
          </NavLink>
          <NavLink to="/admin/failures" className={navCls}>
            Failures
          </NavLink>
          <NavLink to="/admin/wallet" className={navCls}>
            Wallet
          </NavLink>
          <NavLink to="/admin/system" className={navCls}>
            System
          </NavLink>
        </nav>
        <button
          type="button"
          onClick={logout}
          className="mt-auto text-left text-sm text-dark-500 hover:text-red-400 pt-8"
        >
          Clear session
        </button>
      </aside>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="border-b border-dark-800 px-6 py-4 flex justify-between items-center bg-dark-900/30">
          <span className="text-sm text-dark-400">Read-only · P2.5</span>
          <NavLink to="/" className="text-xs text-dark-500 hover:text-white">
            Exit to DEX
          </NavLink>
        </header>
        <main className="p-6 flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function PlaceholderSection({ title }: { title: string }) {
  return (
    <div>
      <h2 className="text-lg font-medium mb-2">{title}</h2>
      <p className="text-sm text-dark-400">Coming in a later phase.</p>
    </div>
  );
}

function SwapRouteBadges({ row }: { row: AdminSwapAnalyticsRow }) {
  const prov = (row.provider ?? '').toLowerCase();
  const wrap =
    Boolean(row.wrapper_route) ||
    row.commission_route === 'wrapper' ||
    prov.includes('wrapper');
  const inch =
    prov.includes('1inch') || (row.commission_route ?? '').toLowerCase().includes('1inch');
  const failed = row.receipt_status === 0;
  return (
    <span className="flex flex-wrap gap-1 mt-1">
      {wrap && (
        <span className="rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide bg-amber-900/55 text-amber-200 border border-amber-800/50">
          wrapper
        </span>
      )}
      {inch && (
        <span className="rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide bg-blue-900/55 text-blue-200 border border-blue-800/50">
          1inch
        </span>
      )}
      {!failed ? (
        <span className="rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide bg-emerald-900/55 text-emerald-200 border border-emerald-800/50">
          success
        </span>
      ) : (
        <span className="rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide bg-red-900/55 text-red-200 border border-red-800/50">
          failed
        </span>
      )}
    </span>
  );
}

function AdminSwapsPage() {
  const { token } = useAdminToken();
  const [tokenSym, setTokenSym] = useState('');
  const [debouncedToken, setDebouncedToken] = useState('');
  const [routeMode, setRouteMode] = useState('');
  const [debouncedRoute, setDebouncedRoute] = useState('');
  const [chainStr, setChainStr] = useState('');
  const [debouncedChain, setDebouncedChain] = useState<number | undefined>(undefined);
  const [successOnly, setSuccessOnly] = useState(true);
  const [data, setData] = useState<AdminSwapsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedToken(tokenSym.trim()), 400);
    return () => window.clearTimeout(id);
  }, [tokenSym]);

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedRoute(routeMode.trim()), 400);
    return () => window.clearTimeout(id);
  }, [routeMode]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      const t = chainStr.trim();
      if (!t) {
        setDebouncedChain(undefined);
        return;
      }
      const n = Number.parseInt(t, 10);
      setDebouncedChain(Number.isFinite(n) ? n : undefined);
    }, 400);
    return () => window.clearTimeout(id);
  }, [chainStr]);

  const fetchList = useCallback(
    async (overrides?: { token?: string; routeMode?: string; chain?: number; successOnly?: boolean }) => {
      setError(null);
      setLoading(true);
      try {
        const chain =
          overrides?.chain !== undefined ? overrides.chain : debouncedChain;
        const res = await fetchAdminSwaps(token, {
          limit: 50,
          offset: 0,
          token: (overrides?.token ?? debouncedToken) || undefined,
          routeMode: (overrides?.routeMode ?? debouncedRoute) || undefined,
          chain,
          successOnly: overrides?.successOnly ?? successOnly,
        });
        setData(res);
      } catch {
        setError('Failed to load swap analytics.');
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    [token, debouncedToken, debouncedRoute, debouncedChain, successOnly],
  );

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  const feePct = (bps: number | null) =>
    bps != null && Number.isFinite(bps) ? `${(bps / 100).toFixed(2)}%` : '—';

  const gasCell = (row: AdminSwapAnalyticsRow) => {
    if (!row.gas_used && !row.effective_gas_price) return '—';
    const g = row.gas_used ?? '—';
    const p = row.effective_gas_price ?? '';
    return p ? `${g} · ${p}` : g;
  };

  const statusText = (row: AdminSwapAnalyticsRow) => {
    if (row.receipt_status === 0) return 'Reverted';
    if (row.receipt_status === 1) return 'OK';
    return '—';
  };

  return (
    <div>
      <h2 className="text-lg font-medium mb-4">Swaps</h2>
      <p className="text-xs text-dark-500 mb-4">
        Rows from <span className="font-mono text-dark-400">swap_success</span> monitoring events (read-only).
      </p>
      <div className="flex flex-wrap gap-3 items-end mb-4">
        <label className="flex flex-col gap-1 text-xs text-dark-500">
          Token symbol
          <input
            type="text"
            value={tokenSym}
            onChange={(e) => setTokenSym(e.target.value)}
            placeholder="e.g. ETH"
            className="rounded-lg bg-dark-900 border border-dark-600 px-2 py-1.5 text-sm text-white w-36"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-dark-500">
          Route mode
          <input
            type="text"
            value={routeMode}
            onChange={(e) => setRouteMode(e.target.value)}
            placeholder="e.g. best"
            className="rounded-lg bg-dark-900 border border-dark-600 px-2 py-1.5 text-sm text-white w-36"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-dark-500">
          Chain ID
          <input
            type="text"
            inputMode="numeric"
            value={chainStr}
            onChange={(e) => setChainStr(e.target.value)}
            placeholder="e.g. 42161"
            className="rounded-lg bg-dark-900 border border-dark-600 px-2 py-1.5 text-sm text-white w-28"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-dark-300 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={successOnly}
            onChange={(e) => setSuccessOnly(e.target.checked)}
            className="rounded border-dark-600"
          />
          Success receipts only
        </label>
        <button
          type="button"
          onClick={() => {
            const t = chainStr.trim();
            const n = t ? Number.parseInt(t, 10) : NaN;
            void fetchList({
              token: tokenSym.trim() || undefined,
              routeMode: routeMode.trim() || undefined,
              chain: Number.isFinite(n) ? n : undefined,
              successOnly,
            });
          }}
          disabled={loading}
          className="rounded-lg bg-dark-700 hover:bg-dark-600 px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
      {data && (
        <p className="text-xs text-dark-500 mb-2">
          Showing {data.items.length} of {data.total} swaps (limit {data.limit})
        </p>
      )}
      <div className="overflow-x-auto rounded-lg border border-dark-700">
        <table className="w-full text-sm text-left min-w-[720px]">
          <thead className="bg-dark-900/80 text-dark-400 text-xs uppercase">
            <tr>
              <th className="px-3 py-2 font-medium">Time</th>
              <th className="px-3 py-2 font-medium">Pair</th>
              <th className="px-3 py-2 font-medium">Amount</th>
              <th className="px-3 py-2 font-medium">Output</th>
              <th className="px-3 py-2 font-medium">Route</th>
              <th className="px-3 py-2 font-medium">Fee %</th>
              <th className="px-3 py-2 font-medium">Gas</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-dark-800">
            {!data || data.items.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-dark-500 text-center">
                  {loading ? 'Loading…' : 'No swap_success rows yet.'}
                </td>
              </tr>
            ) : (
              data.items.map((row: AdminSwapAnalyticsRow, idx: number) => (
                <tr
                  key={`${row.batch_id}-${row.timestamp}-${row.tx_hash ?? idx}`}
                  className="bg-dark-950/50 hover:bg-dark-900/40 align-top"
                >
                  <td className="px-3 py-2 font-mono text-[11px] whitespace-nowrap">{row.timestamp}</td>
                  <td className="px-3 py-2 text-xs">
                    <span className="text-dark-200">
                      {row.from_symbol ?? '?'} → {row.to_symbol ?? '?'}
                    </span>
                    <div className="text-[10px] text-dark-500 mt-0.5">chain {row.chain ?? '—'}</div>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{row.from_amount ?? '—'}</td>
                  <td className="px-3 py-2 font-mono text-xs">{row.quoted_output ?? '—'}</td>
                  <td className="px-3 py-2 text-xs max-w-[14rem]">
                    <div className="text-dark-300 break-words">{row.route_label}</div>
                    <SwapRouteBadges row={row} />
                    <details className="mt-2">
                      <summary className="cursor-pointer text-accent text-[11px]">Raw event</summary>
                      <pre className="mt-2 p-2 rounded bg-dark-900 border border-dark-700 text-[10px] overflow-x-auto max-h-52 overflow-y-auto">
                        {JSON.stringify(row.raw_event, null, 2)}
                      </pre>
                    </details>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{feePct(row.protocol_fee_bps)}</td>
                  <td className="px-3 py-2 font-mono text-[11px] break-all max-w-[10rem]">{gasCell(row)}</td>
                  <td className="px-3 py-2 text-xs">
                    <span className={row.receipt_status === 0 ? 'text-red-400' : 'text-emerald-400'}>
                      {statusText(row)}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AdminEventsPage() {
  const { token } = useAdminToken();
  const [eventFilter, setEventFilter] = useState('');
  const [debouncedEvent, setDebouncedEvent] = useState('');
  const [includeRaw, setIncludeRaw] = useState(false);
  const [data, setData] = useState<AdminEventsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedEvent(eventFilter.trim()), 400);
    return () => window.clearTimeout(id);
  }, [eventFilter]);

  const fetchList = useCallback(
    async (event?: string) => {
      setError(null);
      setLoading(true);
      try {
        const res = await fetchAdminEvents(token, {
          limit: 50,
          offset: 0,
          event,
          includeRaw,
        });
        setData(res);
      } catch {
        setError('Failed to load monitoring batches.');
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    [token, includeRaw],
  );

  useEffect(() => {
    void fetchList(debouncedEvent || undefined);
  }, [fetchList, debouncedEvent]);

  return (
    <div>
      <h2 className="text-lg font-medium mb-4">Monitoring batches</h2>
      <div className="flex flex-wrap gap-3 items-end mb-4">
        <label className="flex flex-col gap-1 text-xs text-dark-500">
          Event name
          <input
            type="text"
            value={eventFilter}
            onChange={(e) => setEventFilter(e.target.value)}
            placeholder="e.g. swap_success"
            className="rounded-lg bg-dark-900 border border-dark-600 px-2 py-1.5 text-sm text-white w-48"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-dark-300 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={includeRaw}
            onChange={(e) => setIncludeRaw(e.target.checked)}
            className="rounded border-dark-600"
          />
          Include raw payload
        </label>
        <button
          type="button"
          onClick={() => void fetchList(eventFilter.trim() || undefined)}
          disabled={loading}
          className="rounded-lg bg-dark-700 hover:bg-dark-600 px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
      {data && (
        <p className="text-xs text-dark-500 mb-2">
          Showing {data.items.length} of {data.total} batches (limit {data.limit}, offset {data.offset})
        </p>
      )}
      <div className="overflow-x-auto rounded-lg border border-dark-700">
        <table className="w-full text-sm text-left">
          <thead className="bg-dark-900/80 text-dark-400 text-xs uppercase">
            <tr>
              <th className="px-3 py-2 font-medium">ID</th>
              <th className="px-3 py-2 font-medium">Received</th>
              <th className="px-3 py-2 font-medium">Session</th>
              <th className="px-3 py-2 font-medium">Count</th>
              <th className="px-3 py-2 font-medium">Events</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-dark-800">
            {!data || data.items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-dark-500 text-center">
                  {loading ? 'Loading…' : 'No batches yet.'}
                </td>
              </tr>
            ) : (
              data.items.map((row: AdminEventsBatchItem) => (
                <tr key={row.id} className="bg-dark-950/50 hover:bg-dark-900/40 align-top">
                  <td className="px-3 py-2 font-mono text-xs">{row.id}</td>
                  <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{row.received_at}</td>
                  <td className="px-3 py-2 font-mono text-xs max-w-[12rem] truncate" title={row.client_session_id}>
                    {row.client_session_id}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{row.event_count}</td>
                  <td className="px-3 py-2 text-xs">
                    <span className="text-dark-300">{row.event_names.join(', ') || '—'}</span>
                    {includeRaw && row.raw !== undefined && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-accent text-xs">Raw payload</summary>
                        <pre className="mt-2 p-2 rounded bg-dark-900 border border-dark-700 text-[11px] overflow-x-auto max-h-64 overflow-y-auto">
                          {JSON.stringify(row.raw, null, 2)}
                        </pre>
                      </details>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AdminRevenuePage() {
  const { token } = useAdminToken();
  const [data, setData] = useState<AdminRevenueResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const r = await fetchAdminRevenue(token);
      setData(r);
    } catch {
      setError('Failed to load revenue aggregates.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const coverageEnriched =
    data && data.total_swaps > 0
      ? ((100 * data.enriched_swaps_count) / data.total_swaps).toFixed(1)
      : '0.0';

  const note =
    'Values are raw token units from receipt telemetry. USD conversion and token decimals normalization will be added later.';

  return (
    <div>
      <h2 className="text-lg font-medium mb-2">Revenue</h2>
      <p className="text-xs text-amber-200/90 bg-amber-950/40 border border-amber-900/50 rounded-lg px-3 py-2 mb-4">
        {note}
      </p>
      {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
      <div className="flex gap-2 mb-4">
        <button
          type="button"
          disabled={loading}
          onClick={() => void load()}
          className="rounded-lg bg-dark-700 hover:bg-dark-600 px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      {!data ? (
        <p className="text-dark-400 text-sm">{loading ? 'Loading…' : 'No data.'}</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-6">
            <div className="rounded-lg border border-dark-700 bg-dark-900/40 p-4">
              <div className="text-xs text-dark-500 uppercase tracking-wide">Total swaps</div>
              <div className="text-2xl font-mono mt-1">{data.total_swaps}</div>
            </div>
            <div className="rounded-lg border border-dark-700 bg-dark-900/40 p-4">
              <div className="text-xs text-dark-500 uppercase tracking-wide">Swaps with fee data</div>
              <div className="text-2xl font-mono mt-1 text-emerald-300">{data.swaps_with_fee_data}</div>
            </div>
            <div className="rounded-lg border border-dark-700 bg-dark-900/40 p-4">
              <div className="text-xs text-dark-500 uppercase tracking-wide">Missing fee data</div>
              <div className="text-2xl font-mono mt-1 text-amber-200/90">{data.missing_fee_data}</div>
            </div>
            <div className="rounded-lg border border-dark-700 bg-dark-900/40 p-4">
              <div className="text-xs text-dark-500 uppercase tracking-wide">Enriched coverage</div>
              <div className="text-2xl font-mono mt-1">{coverageEnriched}%</div>
              <div className="text-[10px] text-dark-500 mt-1">receipt fee / net wei fields present</div>
            </div>
          </div>

          <h3 className="text-sm font-medium text-dark-300 mb-2">By route &amp; token</h3>
          <div className="overflow-x-auto rounded-lg border border-dark-700 mb-8">
            <table className="w-full text-sm text-left min-w-[640px]">
              <thead className="bg-dark-900/80 text-dark-400 text-xs uppercase">
                <tr>
                  <th className="px-3 py-2 font-medium">Fee token</th>
                  <th className="px-3 py-2 font-medium">Raw total</th>
                  <th className="px-3 py-2 font-medium">Chain</th>
                  <th className="px-3 py-2 font-medium">Route</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-800">
                {data.revenue_by_route.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-4 text-dark-500 text-center">
                      No fee aggregates yet.
                    </td>
                  </tr>
                ) : (
                  data.revenue_by_route.map((row: AdminRevenueRouteBucket, i: number) => (
                    <tr key={`${row.chain_id}-${row.route_label}-${row.symbol}-${row.address ?? 'na'}-${i}`} className="bg-dark-950/50">
                      <td className="px-3 py-2 font-mono text-xs">
                        {row.symbol}
                        {row.is_native && <span className="text-dark-500 ml-1">(native)</span>}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs break-all">{row.raw_total}</td>
                      <td className="px-3 py-2 font-mono text-xs">{row.chain_id}</td>
                      <td className="px-3 py-2 text-xs text-dark-300 max-w-md break-words">{row.route_label}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <h3 className="text-sm font-medium text-dark-300 mb-2">Latest fee events</h3>
          <div className="overflow-x-auto rounded-lg border border-dark-700">
            <table className="w-full text-sm text-left min-w-[720px]">
              <thead className="bg-dark-900/80 text-dark-400 text-xs uppercase">
                <tr>
                  <th className="px-3 py-2 font-medium">Time</th>
                  <th className="px-3 py-2 font-medium">Chain</th>
                  <th className="px-3 py-2 font-medium">Route</th>
                  <th className="px-3 py-2 font-medium">Token</th>
                  <th className="px-3 py-2 font-medium">Raw fee</th>
                  <th className="px-3 py-2 font-medium">Tx hash</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-800">
                {data.latest_fee_events.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-4 text-dark-500 text-center">
                      No parsed fee events yet.
                    </td>
                  </tr>
                ) : (
                  data.latest_fee_events.map((ev, idx) => (
                    <tr key={`${ev.tx_hash ?? 'tx'}-${ev.timestamp}-${idx}`} className="bg-dark-950/50 align-top">
                      <td className="px-3 py-2 font-mono text-[11px] whitespace-nowrap">{ev.timestamp}</td>
                      <td className="px-3 py-2 font-mono text-xs">{ev.chain_id}</td>
                      <td className="px-3 py-2 text-xs text-dark-300 max-w-[14rem] break-words">{ev.route_label}</td>
                      <td className="px-3 py-2 font-mono text-xs">{ev.fee_token_symbol}</td>
                      <td className="px-3 py-2 font-mono text-xs break-all">{ev.raw_fee_wei}</td>
                      <td className="px-3 py-2 font-mono text-[11px] break-all max-w-[10rem]">{ev.tx_hash ?? '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function WalletEventBadges({ event }: { event: string }) {
  const appkit = event === 'appkit_reconnect_success';
  const legacy = event.startsWith('legacy_wc_');
  const success =
    event === 'appkit_reconnect_success' || event === 'legacy_wc_reconnect_success';
  const failed = event === 'legacy_wc_reconnect_failure';
  return (
    <span className="flex flex-wrap gap-1 mt-1">
      {appkit && (
        <span className="rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide bg-violet-900/55 text-violet-200 border border-violet-800/50">
          appkit
        </span>
      )}
      {legacy && (
        <span className="rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide bg-slate-700/80 text-slate-200 border border-slate-600/50">
          legacy
        </span>
      )}
      {success && (
        <span className="rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide bg-emerald-900/55 text-emerald-200 border border-emerald-800/50">
          success
        </span>
      )}
      {failed && (
        <span className="rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide bg-red-900/55 text-red-200 border border-red-800/50">
          failed
        </span>
      )}
    </span>
  );
}

function AdminWalletReconnectPage() {
  const { token } = useAdminToken();
  const [data, setData] = useState<AdminWalletReconnectResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const r = await fetchAdminWalletReconnect(token);
      setData(r);
    } catch {
      setError('Failed to load wallet reconnect analytics.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const okReconnects =
    data != null ? data.totals.appkit_success + data.totals.legacy_success : 0;

  return (
    <div>
      <h2 className="text-lg font-medium mb-2">Wallet reconnect</h2>
      <p className="text-xs text-dark-500 mb-4">
        Read-only telemetry from monitoring ingest (latest 1000 reconnect-related events per request).
      </p>
      {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
      <div className="flex gap-2 mb-4">
        <button
          type="button"
          disabled={loading}
          onClick={() => void load()}
          className="rounded-lg bg-dark-700 hover:bg-dark-600 px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      {!data ? (
        <p className="text-dark-400 text-sm">{loading ? 'Loading…' : 'No data.'}</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-6">
            <div className="rounded-lg border border-dark-700 bg-dark-900/40 p-4">
              <div className="text-xs text-dark-500 uppercase tracking-wide">Reconnect scans</div>
              <div className="text-2xl font-mono mt-1">{data.totals.scans}</div>
            </div>
            <div className="rounded-lg border border-dark-700 bg-dark-900/40 p-4">
              <div className="text-xs text-dark-500 uppercase tracking-wide">Successful reconnects</div>
              <div className="text-2xl font-mono mt-1 text-emerald-300">{okReconnects}</div>
              <div className="text-[10px] text-dark-500 mt-1">
                AppKit {data.totals.appkit_success} · Legacy {data.totals.legacy_success}
              </div>
            </div>
            <div className="rounded-lg border border-dark-700 bg-dark-900/40 p-4">
              <div className="text-xs text-dark-500 uppercase tracking-wide">Failed reconnects</div>
              <div className="text-2xl font-mono mt-1 text-red-300">{data.totals.legacy_failures}</div>
              <div className="text-[10px] text-dark-500 mt-1">Legacy WC failures only</div>
            </div>
            <div className="rounded-lg border border-dark-700 bg-dark-900/40 p-4">
              <div className="text-xs text-dark-500 uppercase tracking-wide">Reconnect success %</div>
              <div className="text-2xl font-mono mt-1">
                {data.reconnect_success_rate != null ? `${data.reconnect_success_rate}%` : '—'}
              </div>
              <div className="text-[10px] text-dark-500 mt-1">
                (AppKit + legacy success) / (successes + legacy failures)
              </div>
            </div>
          </div>

          <h3 className="text-sm font-medium text-dark-300 mb-2">Recent failures</h3>
          <div className="overflow-x-auto rounded-lg border border-dark-700 mb-8">
            <table className="w-full text-sm text-left min-w-[720px]">
              <thead className="bg-dark-900/80 text-dark-400 text-xs uppercase">
                <tr>
                  <th className="px-3 py-2 font-medium">Time</th>
                  <th className="px-3 py-2 font-medium">Session</th>
                  <th className="px-3 py-2 font-medium">Reason</th>
                  <th className="px-3 py-2 font-medium">Last connector</th>
                  <th className="px-3 py-2 font-medium">WC project ID</th>
                  <th className="px-3 py-2 font-medium">Tags</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-800">
                {data.recent_failures.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-4 text-dark-500 text-center">
                      No legacy reconnect failures in window.
                    </td>
                  </tr>
                ) : (
                  data.recent_failures.map((row: AdminWalletReconnectFailureRow, idx: number) => (
                    <tr key={`${row.client_session_id}-${row.timestamp}-${idx}`} className="bg-dark-950/50 align-top">
                      <td className="px-3 py-2 font-mono text-[11px] whitespace-nowrap">{row.timestamp}</td>
                      <td className="px-3 py-2 font-mono text-[11px] max-w-[10rem] truncate" title={row.client_session_id}>
                        {row.client_session_id}
                      </td>
                      <td className="px-3 py-2 text-xs">{row.reason}</td>
                      <td className="px-3 py-2 font-mono text-xs">{row.last_connector ?? '—'}</td>
                      <td className="px-3 py-2 text-xs">
                        {row.wc_project_id_configured == null ? '—' : row.wc_project_id_configured ? 'yes' : 'no'}
                      </td>
                      <td className="px-3 py-2">
                        <WalletEventBadges event="legacy_wc_reconnect_failure" />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <h3 className="text-sm font-medium text-dark-300 mb-2">Recent reconnect sessions</h3>
          <div className="overflow-x-auto rounded-lg border border-dark-700 mb-8">
            <table className="w-full text-sm text-left min-w-[720px]">
              <thead className="bg-dark-900/80 text-dark-400 text-xs uppercase">
                <tr>
                  <th className="px-3 py-2 font-medium">Session</th>
                  <th className="px-3 py-2 font-medium">Latest event</th>
                  <th className="px-3 py-2 font-medium">Reconnect count</th>
                  <th className="px-3 py-2 font-medium">AppKit</th>
                  <th className="px-3 py-2 font-medium">Last seen</th>
                  <th className="px-3 py-2 font-medium">Tags</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-800">
                {data.recent_sessions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-4 text-dark-500 text-center">
                      No sessions in window.
                    </td>
                  </tr>
                ) : (
                  data.recent_sessions.map((row: AdminWalletReconnectSessionRow, idx: number) => (
                    <tr key={`${row.client_session_id}-${idx}`} className="bg-dark-950/50 align-top">
                      <td className="px-3 py-2 font-mono text-[11px] max-w-[12rem] truncate" title={row.client_session_id}>
                        {row.client_session_id}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{row.latest_event}</td>
                      <td className="px-3 py-2 font-mono text-xs">{row.reconnect_count}</td>
                      <td className="px-3 py-2 text-xs">{row.appkit_connected ? 'yes' : 'no'}</td>
                      <td className="px-3 py-2 font-mono text-[11px] whitespace-nowrap">{row.last_seen_at}</td>
                      <td className="px-3 py-2">
                        <WalletEventBadges event={row.latest_event} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <h3 className="text-sm font-medium text-dark-300 mb-2">Reconnect timeline (UTC minutes)</h3>
          <div className="overflow-x-auto rounded-lg border border-dark-700">
            <table className="w-full text-sm text-left min-w-[480px]">
              <thead className="bg-dark-900/80 text-dark-400 text-xs uppercase">
                <tr>
                  <th className="px-3 py-2 font-medium">Minute</th>
                  <th className="px-3 py-2 font-medium">Scans</th>
                  <th className="px-3 py-2 font-medium">Success</th>
                  <th className="px-3 py-2 font-medium">Failure</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-800">
                {data.reconnect_timeline.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-4 text-dark-500 text-center">
                      No timeline buckets yet.
                    </td>
                  </tr>
                ) : (
                  data.reconnect_timeline.map((row) => (
                    <tr key={row.minute_bucket} className="bg-dark-950/50">
                      <td className="px-3 py-2 font-mono text-[11px] whitespace-nowrap">{row.minute_bucket}</td>
                      <td className="px-3 py-2 font-mono text-xs">{row.scans}</td>
                      <td className="px-3 py-2 font-mono text-xs text-emerald-400">{row.successes}</td>
                      <td className="px-3 py-2 font-mono text-xs text-red-400">{row.failures}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function AdminOverviewPage() {
  const { token } = useAdminToken();
  const [data, setData] = useState<AdminOverviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const o = await fetchAdminOverview(token);
        if (!cancelled) setData(o);
      } catch {
        if (!cancelled) setError('Failed to load overview.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (error) return <p className="text-red-400 text-sm">{error}</p>;
  if (!data) return <p className="text-dark-400 text-sm">Loading…</p>;

  return (
    <div>
      <h2 className="text-lg font-medium mb-4">Overview</h2>
      <dl className="grid gap-3 sm:grid-cols-2 max-w-xl text-sm">
        <div className="rounded-lg border border-dark-700 bg-dark-900/40 p-4">
          <dt className="text-dark-500">Service</dt>
          <dd className="font-mono">{data.service}</dd>
        </div>
        <div className="rounded-lg border border-dark-700 bg-dark-900/40 p-4">
          <dt className="text-dark-500">Status</dt>
          <dd className="font-mono">{data.status}</dd>
        </div>
        <div className="rounded-lg border border-dark-700 bg-dark-900/40 p-4">
          <dt className="text-dark-500">Monitoring batches</dt>
          <dd className="font-mono">{data.monitoring_batch_count}</dd>
        </div>
        <div className="rounded-lg border border-dark-700 bg-dark-900/40 p-4">
          <dt className="text-dark-500">Latest batch received</dt>
          <dd className="font-mono text-xs break-all">{data.monitoring_latest_received_at ?? '—'}</dd>
        </div>
        <div className="rounded-lg border border-dark-700 bg-dark-900/40 p-4 sm:col-span-2">
          <dt className="text-dark-500">Frontend / live</dt>
          <dd className="font-mono text-xs">{data.frontend_health.status}</dd>
          <dd className="text-dark-500 mt-1">{data.frontend_health.note}</dd>
        </div>
      </dl>
    </div>
  );
}

export default function AdminApp() {
  const [token, setToken] = useState<string | null>(() => getStoredAdminToken());

  const logout = useCallback(() => {
    clearStoredAdminToken();
    setToken(null);
  }, []);

  const ctx = useMemo(() => (token ? { token, logout } : null), [token, logout]);

  if (!token) {
    return (
      <Routes>
        <Route path="*" element={<AdminUnlock />} />
      </Routes>
    );
  }

  return (
    <AdminTokenContext.Provider value={ctx!}>
      <Routes>
        <Route element={<AdminLayout />}>
          <Route index element={<AdminOverviewPage />} />
          <Route path="events" element={<AdminEventsPage />} />
          <Route path="swaps" element={<AdminSwapsPage />} />
          <Route path="revenue" element={<AdminRevenuePage />} />
          <Route path="failures" element={<PlaceholderSection title="Failures" />} />
          <Route path="wallet" element={<AdminWalletReconnectPage />} />
          <Route path="system" element={<PlaceholderSection title="System" />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Route>
      </Routes>
    </AdminTokenContext.Provider>
  );
}
