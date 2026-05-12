/**
 * P3.4 — Read-only operational health (Admin → System). Detection only; no remediation.
 */

import { useCallback, useMemo, useState } from 'react';
import { Button } from '@/components/common/Button';
import {
  fetchAdminHealth,
  resolveAdminApiToken,
  setStoredAdminApiToken,
  type AdminHealthPayload,
  type AdminSharedTokenProps,
} from '@/utils/adminApi';

function DomainStatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  const cls =
    s === 'critical'
      ? 'bg-red-900/40 text-red-100 border-red-700/40'
      : s === 'warning'
        ? 'bg-amber-900/35 text-amber-100 border-amber-700/35'
        : s === 'healthy'
          ? 'bg-emerald-900/35 text-emerald-100 border-emerald-700/35'
          : 'bg-dark-800 text-dark-400 border-white/[0.08]';
  return (
    <span className={`inline-flex rounded px-2 py-0.5 text-[10px] font-semibold uppercase border ${cls}`}>
      {status}
    </span>
  );
}

function JsonExpander({ title, value }: { title: string; value: unknown }) {
  const raw = useMemo(() => JSON.stringify(value, null, 2), [value]);
  return (
    <details className="rounded-lg border border-white/[0.08] bg-dark-950/80">
      <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-dark-400 hover:text-dark-200">
        {title}
      </summary>
      <pre className="max-h-40 overflow-auto px-3 pb-3 text-[10px] leading-relaxed text-dark-300 font-mono whitespace-pre-wrap break-all">
        {raw}
      </pre>
    </details>
  );
}

const DOMAIN_ORDER = [
  'ingest_pipeline',
  'swaps',
  'providers',
  'rpc',
  'wallet_reconnect',
  'lifecycle',
  'reconciliation',
  'commission',
] as const;

export function OperationalHealthPanel({ adminToken: controlledToken, onAdminTokenChange }: AdminSharedTokenProps) {
  const [internalToken, setInternalToken] = useState(() => resolveAdminApiToken());
  const tokenInput = controlledToken !== undefined ? controlledToken : internalToken;
  const setTokenInput = (next: string) => {
    if (controlledToken !== undefined && onAdminTokenChange) {
      onAdminTokenChange(next);
    } else {
      setInternalToken(next);
    }
  };
  const [windowMinutes, setWindowMinutes] = useState(60);
  const [stallMinutes, setStallMinutes] = useState(20);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<AdminHealthPayload | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const tok = tokenInput.trim() || resolveAdminApiToken();
      const out = await fetchAdminHealth(tok, {
        windowMinutes,
        stallMinutes,
      });
      setData(out);
      setStoredAdminApiToken(tok);
    } catch (e) {
      setData(null);
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [tokenInput, windowMinutes, stallMinutes]);

  const domains = data?.domains ?? {};
  const incidents = data?.operational_incidents ?? [];
  const warns = data?.active_warnings ?? [];
  const hb = data?.ingest_heartbeat as Record<string, unknown> | undefined;
  const timeline = data?.health_timeline ?? [];

  return (
    <div className="rounded-xl border border-white/[0.08] bg-dark-900/80 text-[13px] text-dark-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <div className="border-b border-white/[0.06] px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-white">Admin · System</div>
            <div className="text-[11px] text-dark-500 mt-0.5">
              Read-only operational health · rolling window by server <code className="text-dark-400">received_at</code>
            </div>
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </Button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block space-y-1 sm:col-span-2">
            <span className="text-[11px] uppercase tracking-wide text-dark-500">X-Admin-Token</span>
            <input
              type="password"
              autoComplete="off"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              className="w-full rounded-lg border border-white/[0.1] bg-dark-950 px-3 py-2 text-xs text-white placeholder:text-dark-600 focus:outline-none focus:ring-1 focus:ring-cyan-500/40"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] uppercase tracking-wide text-dark-500">Window (min)</span>
            <input
              type="number"
              min={5}
              value={windowMinutes}
              onChange={(e) => setWindowMinutes(Number(e.target.value) || 60)}
              className="w-full rounded-lg border border-white/[0.1] bg-dark-950 px-3 py-2 text-xs text-white"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] uppercase tracking-wide text-dark-500">Lifecycle stall (min)</span>
            <input
              type="number"
              min={1}
              max={240}
              value={stallMinutes}
              onChange={(e) => setStallMinutes(Number(e.target.value) || 20)}
              className="w-full rounded-lg border border-white/[0.1] bg-dark-950 px-3 py-2 text-xs text-white"
            />
          </label>
        </div>

        {err && (
          <div className="rounded-lg border border-red-800/40 bg-red-950/30 px-3 py-2 text-xs text-red-200">{err}</div>
        )}

        {data && (
          <>
            {(incidents.length > 0 || warns.length > 0) && (
              <div className="space-y-2">
                {incidents.length > 0 && (
                  <div className="rounded-lg border border-red-800/45 bg-red-950/25 px-3 py-2 text-xs text-red-100">
                    <div className="font-semibold mb-1">Active incidents (critical)</div>
                    <ul className="list-disc list-inside space-y-0.5 text-red-100/95">
                      {incidents.map((i, idx) => (
                        <li key={idx}>
                          <span className="text-red-200/80">[{String(i.domain)}]</span> {String(i.message ?? '')}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {warns.length > 0 && (
                  <div className="rounded-lg border border-amber-800/40 bg-amber-950/20 px-3 py-2 text-xs text-amber-100">
                    <div className="font-semibold mb-1">Warnings</div>
                    <ul className="list-disc list-inside space-y-0.5">
                      {warns.map((w, idx) => (
                        <li key={idx}>
                          <span className="text-amber-200/80">[{String(w.domain)}]</span> {String(w.message ?? '')}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-lg border border-white/[0.06] bg-dark-950/60 p-3">
                <div className="text-[10px] uppercase text-dark-500">Overall</div>
                <div className="flex items-center gap-2 mt-1">
                  <DomainStatusBadge status={String(data.overall?.status ?? 'unknown')} />
                  <span className="text-lg font-semibold text-white">{data.overall?.score ?? '—'}</span>
                </div>
              </div>
              <div className="rounded-lg border border-white/[0.06] bg-dark-950/60 p-3 sm:col-span-2">
                <div className="text-[10px] uppercase text-dark-500">Last ingest</div>
                <div className="text-[11px] text-dark-200 mt-1 font-mono break-all">
                  {hb?.last_received_at != null ? String(hb.last_received_at) : '—'}
                </div>
                <div className="text-[10px] text-dark-500 mt-0.5">
                  age: {hb?.age_minutes != null ? `${hb.age_minutes} min` : '—'} · batches in window:{' '}
                  {hb?.batches_in_window != null ? String(hb.batches_in_window) : '—'}
                </div>
              </div>
              <div className="rounded-lg border border-white/[0.06] bg-dark-950/60 p-3">
                <div className="text-[10px] uppercase text-dark-500">Evaluated</div>
                <div className="text-[11px] text-dark-200 mt-1 break-all">{data.evaluated_at ?? '—'}</div>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-dark-500 mb-2">Domains</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {DOMAIN_ORDER.map((key) => {
                  const d = domains[key];
                  if (!d) return null;
                  return (
                    <div
                      key={key}
                      className="rounded-lg border border-white/[0.06] bg-dark-950/50 p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-mono text-cyan-200/90">{key}</span>
                        <DomainStatusBadge status={String(d.status ?? 'unknown')} />
                      </div>
                      <div className="text-[11px] text-dark-400 leading-snug">{d.summary}</div>
                      <div className="text-[10px] text-dark-500">
                        score <span className="font-mono text-dark-300">{d.score ?? '—'}</span>
                      </div>
                      <JsonExpander title="Evidence + metrics" value={{ evidence: d.evidence, recent_metrics: d.recent_metrics }} />
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-dark-500 mb-2">
                Health timeline (server buckets)
              </h3>
              <div className="overflow-x-auto rounded-lg border border-white/[0.06]">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-dark-950/80 text-dark-500">
                    <tr>
                      <th className="px-2 py-2">#</th>
                      <th className="px-2 py-2">Batches</th>
                      <th className="px-2 py-2">Events</th>
                      <th className="px-2 py-2">Top types</th>
                    </tr>
                  </thead>
                  <tbody>
                    {timeline.map((row) => {
                      const ec = (row.event_counts as Record<string, number> | undefined) ?? {};
                      const top = Object.entries(ec)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 4)
                        .map(([k, v]) => `${k}:${v}`)
                        .join(', ');
                      return (
                        <tr key={String(row.bucket_index)} className="border-t border-white/[0.04]">
                          <td className="px-2 py-1.5 font-mono text-dark-500">{String(row.bucket_index)}</td>
                          <td className="px-2 py-1.5">{String(row.batches ?? '')}</td>
                          <td className="px-2 py-1.5">{String(row.events_total ?? '')}</td>
                          <td className="px-2 py-1.5 text-dark-400 max-w-[200px] truncate" title={top}>
                            {top || '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <JsonExpander title="Full health response" value={data} />
          </>
        )}

        <p className="text-[11px] text-dark-600 leading-relaxed">
          {data?._meta?.false_positive_note != null
            ? String(data._meta.false_positive_note)
            : 'Thresholds are query-tunable on the API. Low traffic increases unknown domains.'}
        </p>
      </div>
    </div>
  );
}
