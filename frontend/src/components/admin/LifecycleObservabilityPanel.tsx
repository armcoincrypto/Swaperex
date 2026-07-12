/**
 * P3.3 — Read-only swap lifecycle observability (admin API).
 * No chart libraries. Token: VITE_ADMIN_API_TOKEN or session (see adminApi).
 */

import { useCallback, useMemo, useState } from 'react';
import { Button } from '@/components/common/Button';
import { TRANSACTION_CORRELATION_FIELD, TELEMETRY_CORRELATION_ALIAS_FIELD } from '@/utils/transactionCorrelation';
import {
  fetchAdminLifecycle,
  resolveAdminApiToken,
  setStoredAdminApiToken,
  type AdminLifecyclePayload,
  type AdminSharedTokenProps,
} from '@/utils/adminApi';

const CHAIN_LABEL: Record<number, string> = {
  1: 'ETH',
  56: 'BSC',
  137: 'POL',
  8453: 'Base',
  42161: 'ARB',
  10: 'OP',
};

function formatMs(ms: number | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${(ms / 60_000).toFixed(1)} min`;
}

function StageBadge({ stage }: { stage: string }) {
  const minedOk = stage === 'tx_mined' || stage === 'reconciliation_completed';
  const fail = stage === 'swap_failed' || stage === 'approval_failed';
  const abandoned = stage === 'abandoned';
  const cls = fail
    ? 'bg-red-900/35 text-red-200 border-red-700/35'
    : abandoned
      ? 'bg-amber-900/30 text-amber-100 border-amber-700/30'
      : minedOk
        ? 'bg-emerald-900/40 text-emerald-200 border-emerald-700/40'
        : 'bg-dark-800 text-dark-200 border-white/[0.1]';
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-wide border ${cls}`}
    >
      {stage}
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
      <pre className="max-h-48 overflow-auto px-3 pb-3 text-[10px] leading-relaxed text-dark-300 font-mono whitespace-pre-wrap break-all">
        {raw}
      </pre>
    </details>
  );
}

export function LifecycleObservabilityPanel({ adminToken: controlledToken, onAdminTokenChange }: AdminSharedTokenProps) {
  const [internalToken, setInternalToken] = useState(() => resolveAdminApiToken());
  const tokenInput = controlledToken !== undefined ? controlledToken : internalToken;
  const setTokenInput = (next: string) => {
    if (controlledToken !== undefined && onAdminTokenChange) {
      onAdminTokenChange(next);
    } else {
      setInternalToken(next);
    }
  };
  const [stallMinutes, setStallMinutes] = useState(20);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<AdminLifecyclePayload | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const tok = tokenInput.trim() || resolveAdminApiToken();
      const out = await fetchAdminLifecycle(tok, stallMinutes);
      setData(out);
      setStoredAdminApiToken(tok);
    } catch (e) {
      setData(null);
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [tokenInput, stallMinutes]);

  const stalled = data?.stalled_flows ?? [];
  const totals = data?.lifecycle_totals ?? {};
  const durations = data?.average_stage_durations_ms ?? {};
  const dropoff = data?.dropoff_by_stage ?? {};

  return (
    <div className="rounded-xl border border-white/[0.08] bg-dark-900/80 text-[13px] text-dark-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <div className="border-b border-white/[0.06] px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-white">Admin · Lifecycle</div>
            <div className="text-[11px] text-dark-500 mt-0.5">
              Read-only · correlates <code className="text-dark-400">{TRANSACTION_CORRELATION_FIELD}</code> /{' '}
              <code className="text-dark-400">{TELEMETRY_CORRELATION_ALIAS_FIELD}</code> from{' '}
              <code className="text-dark-400">swap_lifecycle</code> batches (same value as support diagnostics)
            </div>
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </Button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-[11px] uppercase tracking-wide text-dark-500">X-Admin-Token</span>
            <input
              type="password"
              autoComplete="off"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="Paste token (stored in session for this tab)"
              className="w-full rounded-lg border border-white/[0.1] bg-dark-950 px-3 py-2 text-xs text-white placeholder:text-dark-600 focus:outline-none focus:ring-1 focus:ring-cyan-500/40"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] uppercase tracking-wide text-dark-500">Stall threshold (minutes)</span>
            <input
              type="number"
              min={1}
              max={240}
              value={stallMinutes}
              onChange={(e) => setStallMinutes(Number(e.target.value) || 20)}
              className="w-full rounded-lg border border-white/[0.1] bg-dark-950 px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-cyan-500/40"
            />
          </label>
        </div>

        {err && (
          <div className="rounded-lg border border-red-800/40 bg-red-950/30 px-3 py-2 text-xs text-red-200">
            {err}
          </div>
        )}

        {stalled.length > 0 && (
          <div className="rounded-lg border border-amber-800/35 bg-amber-950/25 px-3 py-2 text-xs text-amber-100">
            <span className="font-semibold">Stalled flows:</span> {stalled.length} non-terminal flows exceeded the
            stall window (server clock vs last event <code className="text-amber-200/90">ts</code>).
          </div>
        )}

        {data && (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-lg border border-white/[0.06] bg-dark-950/60 p-3">
                <div className="text-[10px] uppercase text-dark-500">Flows</div>
                <div className="text-lg font-semibold text-white">{data.flows_observed ?? '—'}</div>
              </div>
              <div className="rounded-lg border border-white/[0.06] bg-dark-950/60 p-3">
                <div className="text-[10px] uppercase text-dark-500">Success %</div>
                <div className="text-lg font-semibold text-emerald-300">
                  {data.lifecycle_success_rate != null ? `${data.lifecycle_success_rate}%` : '—'}
                </div>
              </div>
              <div className="rounded-lg border border-white/[0.06] bg-dark-950/60 p-3">
                <div className="text-[10px] uppercase text-dark-500">Failure %</div>
                <div className="text-lg font-semibold text-red-300">
                  {data.lifecycle_failure_rate != null ? `${data.lifecycle_failure_rate}%` : '—'}
                </div>
              </div>
              <div className="rounded-lg border border-white/[0.06] bg-dark-950/60 p-3">
                <div className="text-[10px] uppercase text-dark-500">Abandoned</div>
                <div className="text-lg font-semibold text-dark-200">{data.flows_abandoned_count ?? '—'}</div>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-dark-500 mb-2">Stage totals</h3>
              <div className="overflow-x-auto rounded-lg border border-white/[0.06]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-dark-950/80 text-dark-500">
                    <tr>
                      <th className="px-3 py-2">Stage</th>
                      <th className="px-3 py-2 text-right">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(totals).map(([k, v]) => (
                      <tr key={k} className="border-t border-white/[0.04]">
                        <td className="px-3 py-2">
                          <StageBadge stage={k} />
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-dark-200">{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-dark-500 mb-2">
                Average stage durations (ms)
              </h3>
              <div className="overflow-x-auto rounded-lg border border-white/[0.06]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-dark-950/80 text-dark-500">
                    <tr>
                      <th className="px-3 py-2">Transition</th>
                      <th className="px-3 py-2 text-right">Avg ms</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(durations).map(([k, v]) => (
                      <tr key={k} className="border-t border-white/[0.04]">
                        <td className="px-3 py-2 font-mono text-[10px] text-dark-300">{k}</td>
                        <td className="px-3 py-2 text-right font-mono text-dark-200">{formatMs(v)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-dark-500 mb-2">
                Drop-off (last non-terminal stage)
              </h3>
              <div className="overflow-x-auto rounded-lg border border-white/[0.06]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-dark-950/80 text-dark-500">
                    <tr>
                      <th className="px-3 py-2">Stage</th>
                      <th className="px-3 py-2 text-right">Flows</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(dropoff).map(([k, v]) => (
                      <tr key={k} className="border-t border-white/[0.04]">
                        <td className="px-3 py-2">
                          <StageBadge stage={k} />
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-dark-200">{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-dark-500 mb-2">Stalled flows</h3>
              <div className="overflow-x-auto rounded-lg border border-white/[0.06]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-dark-950/80 text-dark-500">
                    <tr>
                      <th className="px-3 py-2">Flow</th>
                      <th className="px-3 py-2">Stage</th>
                      <th className="px-3 py-2">Chain</th>
                      <th className="px-3 py-2">Provider</th>
                      <th className="px-3 py-2 text-right">Stall</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stalled.map((r) => (
                      <tr key={String(r.swap_flow_id)} className="border-t border-white/[0.04]">
                        <td className="px-3 py-2 font-mono text-[10px] text-cyan-200/90 max-w-[140px] truncate">
                          {r.swap_flow_id}
                        </td>
                        <td className="px-3 py-2">
                          {r.last_stage ? <StageBadge stage={String(r.last_stage)} /> : '—'}
                        </td>
                        <td className="px-3 py-2">
                          {r.chain_id != null ? (
                            <span className="rounded border border-white/[0.08] bg-dark-950 px-1.5 py-0.5 text-[10px] text-dark-200">
                              {CHAIN_LABEL[Number(r.chain_id)] ?? `chain:${r.chain_id}`}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {r.provider ? (
                            <span className="rounded border border-white/[0.08] bg-dark-950 px-1.5 py-0.5 text-[10px] text-dark-200">
                              {String(r.provider)}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-amber-200/90">
                          {r.stall_minutes_observed != null ? `${r.stall_minutes_observed} min` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-dark-500 mb-2">
                Recent lifecycle flows
              </h3>
              <div className="space-y-3">
                {(data.recent_lifecycle_flows ?? []).map((flow) => (
                  <div
                    key={String(flow.swap_flow_id)}
                    className="rounded-lg border border-white/[0.06] bg-dark-950/50 p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      <span className="font-mono text-cyan-200/90">{flow.swap_flow_id}</span>
                      {flow.chain_id != null && (
                        <span className="rounded border border-white/[0.08] bg-dark-900 px-1.5 py-0.5 text-[10px]">
                          {CHAIN_LABEL[Number(flow.chain_id)] ?? `chain:${flow.chain_id}`}
                        </span>
                      )}
                      {flow.provider && (
                        <span className="rounded border border-white/[0.08] bg-dark-900 px-1.5 py-0.5 text-[10px]">
                          {String(flow.provider)}
                        </span>
                      )}
                      {flow.route_mode && (
                        <span className="text-dark-500">route: {String(flow.route_mode)}</span>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {(flow.timeline ?? []).map((step, i) => (
                        <span key={`${step.stage}-${i}`} className="flex items-center gap-1">
                          {i > 0 && <span className="text-dark-600">→</span>}
                          <StageBadge stage={String(step.stage)} />
                        </span>
                      ))}
                    </div>
                    <JsonExpander title="Raw flow payload" value={flow} />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-dark-500 mb-2">
                Recent lifecycle events
              </h3>
              <div className="overflow-x-auto rounded-lg border border-white/[0.06]">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-dark-950/80 text-dark-500">
                    <tr>
                      <th className="px-2 py-2">ts</th>
                      <th className="px-2 py-2">flow</th>
                      <th className="px-2 py-2">stage</th>
                      <th className="px-2 py-2">chain</th>
                      <th className="px-2 py-2">provider</th>
                      <th className="px-2 py-2">tx</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.recent_lifecycle_events ?? []).map((ev, idx) => (
                      <tr key={`${String(ev.swap_flow_id)}-${idx}`} className="border-t border-white/[0.04]">
                        <td className="px-2 py-1.5 font-mono text-dark-500">{String(ev.ts_ms ?? '')}</td>
                        <td className="px-2 py-1.5 font-mono text-cyan-200/80 max-w-[100px] truncate">
                          {String(ev.swap_flow_id ?? '')}
                        </td>
                        <td className="px-2 py-1.5">
                          {ev.stage ? <StageBadge stage={String(ev.stage)} /> : '—'}
                        </td>
                        <td className="px-2 py-1.5">
                          {ev.chain_id != null
                            ? CHAIN_LABEL[Number(ev.chain_id)] ?? ev.chain_id
                            : '—'}
                        </td>
                        <td className="px-2 py-1.5 max-w-[80px] truncate">{String(ev.provider ?? '')}</td>
                        <td className="px-2 py-1.5 font-mono text-[9px] text-dark-400 max-w-[120px] truncate">
                          {String(ev.tx_hash ?? '')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-2">
                <JsonExpander title="Raw recent_lifecycle_events" value={data.recent_lifecycle_events} />
              </div>
            </div>

            <JsonExpander title="Full API response" value={data} />
          </>
        )}

        <p className="text-[11px] text-dark-600 leading-relaxed">
          Taxonomy: {data?.lifecycle_taxonomy_version ?? '—'}. Durations use consecutive deduplicated stage timestamps
          from telemetry. Stall uses wall clock at request time vs last event <code className="text-dark-500">ts</code>
          .
        </p>
      </div>
    </div>
  );
}
