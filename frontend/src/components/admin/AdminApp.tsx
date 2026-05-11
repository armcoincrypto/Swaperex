/**
 * Isolated admin SPA shell (/admin). Token in sessionStorage only (P2.1).
 * Overview + Events explorer (P2.2).
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { NavLink, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import {
  clearStoredAdminToken,
  fetchAdminEvents,
  fetchAdminHealth,
  fetchAdminOverview,
  getStoredAdminToken,
  setStoredAdminToken,
  type AdminEventsBatchItem,
  type AdminEventsResponse,
  type AdminOverviewResponse,
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
          <span className="text-sm text-dark-400">Read-only · P2.2</span>
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
          <Route path="swaps" element={<PlaceholderSection title="Swaps" />} />
          <Route path="revenue" element={<PlaceholderSection title="Revenue" />} />
          <Route path="failures" element={<PlaceholderSection title="Failures" />} />
          <Route path="wallet" element={<PlaceholderSection title="Wallet" />} />
          <Route path="system" element={<PlaceholderSection title="System" />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Route>
      </Routes>
    </AdminTokenContext.Provider>
  );
}
