/**
 * P5A/P5B — Operator intelligence & daily decision support (read-only).
 */

import { useEffect, useState } from 'react';
import {
  fetchAdminOperatorIntelligence,
  type AdminOperatorIntelligenceResponse,
} from '@/admin/adminApi';
import {
  chainLabel,
  confidenceClass,
  formatDeltaPct,
  formatPct,
  formatWeiShort,
  healthScoreClass,
  priorityClass,
  severityClass,
  statusLevelClass,
} from '@/lib/analytics/operatorIntelligenceFormat';

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-dark-700 bg-dark-900/40 p-3">
      <div className="text-[10px] text-dark-500 uppercase tracking-wide">{label}</div>
      <div className="text-lg font-mono mt-1">{value}</div>
    </div>
  );
}

function PairTable({
  title,
  rows,
  columns,
}: {
  title: string;
  rows: Array<Record<string, unknown>>;
  columns: Array<{ key: string; label: string; render?: (v: unknown, row: Record<string, unknown>) => string }>;
}) {
  return (
    <div className="rounded-xl border border-dark-700 bg-dark-900/30 p-4">
      <h3 className="text-sm font-medium text-dark-200 mb-3">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-dark-500 text-sm">No data in scanned window.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-dark-500 text-left border-b border-dark-800">
                {columns.map((c) => (
                  <th key={c.key} className="py-2 pr-3 font-medium">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b border-dark-800/60">
                  {columns.map((c) => (
                    <td key={c.key} className="py-2 pr-3 font-mono text-dark-200">
                      {c.render ? c.render(row[c.key], row) : String(row[c.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function OperatorIntelligencePage({ token }: { token: string }) {
  const [data, setData] = useState<AdminOperatorIntelligenceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchAdminOperatorIntelligence(token, { maxBatches: 500 });
        if (!cancelled) setData(res);
      } catch {
        if (!cancelled) setError('Failed to load operator intelligence.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading && !data) {
    return <p className="text-dark-400 text-sm p-4">Loading operator intelligence…</p>;
  }
  if (error) {
    return <p className="text-red-400 text-sm p-4">{error}</p>;
  }
  if (!data) return null;

  const ex = data.executive_summary;
  const comm7 = ex.commission_7d.reduce((a, r) => a + BigInt(r.fee_wei), 0n);
  const ds = data.decision_support;
  const daily = ds?.daily_executive_summary;
  const status = daily?.status;
  const dataConfidence = ds?.data_confidence;
  const scan = data.window.scan;
  const insufficient = dataConfidence?.level === 'insufficient';

  return (
    <div className="p-6 max-w-6xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-white">Operator Intelligence</h1>
        <p className="text-sm text-dark-400 mt-1">
          Daily decision support — revenue, trends, and actionable recommendations (read-only).
        </p>
        <p className="text-xs text-dark-500 mt-2">
          <a
            href="/trust"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent/90 hover:text-accent underline-offset-2 hover:underline"
          >
            Public trust page
          </a>
          <span className="text-dark-600"> — user-facing transparency (no operator data)</span>
        </p>
        <p className="text-[11px] text-dark-500 mt-2 font-mono">
          Generated {data.generated_at} · {data.window.events_scanned} events /{' '}
          {data.window.batches_scanned} batches
          {scan?.scan_duration_ms != null && ` · scan ${scan.scan_duration_ms}ms`}
          {scan?.scan_limited && ' · scan limited'}
        </p>
        {dataConfidence && (
          <p className="text-[11px] text-dark-400 mt-1">
            Data confidence:{' '}
            <span className={`font-medium uppercase ${confidenceClass(dataConfidence.level)}`}>
              {dataConfidence.level}
            </span>{' '}
            · {dataConfidence.quotes_7d} quotes (7d)
          </p>
        )}
      </div>

      {insufficient && dataConfidence?.ui_hint && (
        <section className="rounded-xl border border-slate-700/60 bg-slate-900/40 px-4 py-4">
          <h2 className="text-sm font-semibold text-slate-200">Not enough telemetry yet</h2>
          <p className="text-sm text-dark-400 mt-2">{dataConfidence.ui_hint}</p>
          <p className="text-xs text-dark-500 mt-2">
            Collect more swap activity before making operational decisions.
          </p>
        </section>
      )}

      {ds && daily && status && (
        <section
          className={`rounded-xl border px-4 py-4 ${statusLevelClass(status.level)}`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide">
                Morning status — {status.label}
              </h2>
              <p className="text-[11px] mt-1 opacity-90">
                {status.level === 'green' && 'All monitored signals within normal thresholds.'}
                {status.level === 'yellow' && 'One or more metrics need watching today.'}
                {status.level === 'red' && 'Immediate operator review recommended.'}
                {status.level === 'insufficient_data' &&
                  'Insufficient telemetry for reliable operational status.'}
              </p>
            </div>
            {ds.health_score && (
              <div className="text-right">
                <div className="text-[10px] uppercase opacity-80">Health score</div>
                {ds.health_score.score != null ? (
                  <div
                    className={`text-3xl font-mono font-bold ${healthScoreClass(ds.health_score.score)}`}
                  >
                    {ds.health_score.score}
                  </div>
                ) : (
                  <div className="text-sm font-mono text-dark-500">N/A</div>
                )}
                {ds.health_score.caution && (
                  <p className="text-[10px] text-amber-200/80 mt-1">{ds.health_score.caution}</p>
                )}
              </div>
            )}
          </div>
          {status.reasons.length > 0 && (
            <ul className="mt-3 text-xs list-disc pl-4 space-y-1 opacity-90">
              {status.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      {ds && daily && (
        <section>
          <h2 className="text-sm font-medium text-dark-300 mb-3">Daily Executive Summary</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard label="Commission today (wei)" value={String(daily.commission_today_wei ?? 0)} />
            <MetricCard label="Commission yesterday" value={String(daily.commission_yesterday_wei ?? 0)} />
            <MetricCard
              label="7d commission change"
              value={formatDeltaPct(daily.commission_7d_change_pct)}
            />
            <MetricCard label="Swaps today" value={String(daily.swap_count_today ?? 0)} />
            <MetricCard label="Quotes today" value={String(daily.quote_count_today ?? 0)} />
            <MetricCard
              label="Quote success % today"
              value={formatPct(daily.quote_success_rate_pct_today)}
            />
            <MetricCard
              label="Swap success % today"
              value={formatPct(daily.swap_success_rate_pct_today)}
            />
            <MetricCard
              label="Top pair today"
              value={daily.top_pair_today?.pair_label ?? '—'}
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-3 mt-3 text-xs text-dark-400">
            {daily.biggest_improvement && (
              <p>
                Biggest improvement:{' '}
                <span className="text-emerald-300 font-mono">{daily.biggest_improvement.pair_label}</span>{' '}
                ({formatDeltaPct(daily.biggest_improvement.change_pct)} quotes)
              </p>
            )}
            {daily.biggest_decline && (
              <p>
                Biggest decline:{' '}
                <span className="text-red-300 font-mono">{daily.biggest_decline.pair_label}</span>{' '}
                ({formatDeltaPct(daily.biggest_decline.change_pct)} quotes)
              </p>
            )}
            {daily.top_chain_today && (
              <p>
                Top chain today:{' '}
                <span className="text-cyan-200">{chainLabel(daily.top_chain_today.chain_id)}</span>
              </p>
            )}
            {daily.largest_commission_today && (
              <p>
                Largest commission today:{' '}
                <span className="font-mono">{formatWeiShort(daily.largest_commission_today.fee_wei as string)}</span>
              </p>
            )}
          </div>
        </section>
      )}

      {ds && ds.recommendations.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-dark-300 mb-3">Operator Recommendations</h2>
          <div className="space-y-2">
            {ds.recommendations.map((rec) => (
              <div
                key={rec.id}
                className={`rounded-lg border px-3 py-3 text-sm ${
                  rec.confidence === 'low' || rec.confidence === 'insufficient'
                    ? 'border-dark-800 bg-dark-900/25 opacity-90'
                    : 'border-dark-700 bg-dark-900/40'
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-[10px] uppercase font-medium ${priorityClass(rec.priority)}`}>
                    {rec.priority}
                  </span>
                  <span className={`text-[10px] uppercase ${confidenceClass(rec.confidence)}`}>
                    {rec.confidence} confidence
                  </span>
                  {rec.sample_size != null && (
                    <span className="text-[10px] text-dark-500 font-mono">
                      n={rec.sample_size} quotes (7d)
                    </span>
                  )}
                </div>
                <p className="font-medium text-dark-100 mt-1">{rec.title}</p>
                <p className="text-xs text-dark-400 mt-1">{rec.reason}</p>
                {rec.evidence && (
                  <p className="text-[11px] text-dark-500 mt-1 font-mono">Evidence: {rec.evidence}</p>
                )}
                <p className="text-xs text-cyan-200/90 mt-2">→ {rec.action}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {ds?.health_score && (
        <section>
          <h2 className="text-sm font-medium text-dark-300 mb-3">Operator Health Score</h2>
          <div className="rounded-xl border border-dark-700 bg-dark-900/30 p-4">
            {ds.health_score.score != null ? (
              <p className={`text-4xl font-mono font-bold ${healthScoreClass(ds.health_score.score)}`}>
                {ds.health_score.score}
                <span className="text-lg text-dark-500 font-normal"> / 100</span>
              </p>
            ) : (
              <p className="text-sm text-dark-500">{ds.health_score.message ?? 'Insufficient data'}</p>
            )}
            {ds.health_score.deductions.length > 0 ? (
              <ul className="mt-3 space-y-1 text-xs text-dark-400">
                {ds.health_score.deductions.map((d, i) => (
                  <li key={i}>
                    −{d.points} {d.dimension}: {d.reason}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-dark-500 mt-2">No deductions — all dimensions within thresholds.</p>
            )}
          </div>
        </section>
      )}

      {ds?.trends && (
        <section>
          <h2 className="text-sm font-medium text-dark-300 mb-3">Trend Cards</h2>
          <div className="grid sm:grid-cols-3 gap-3">
            <MetricCard
              label="Commission 7d change"
              value={formatDeltaPct(ds.trends.commission.change_7d_pct as number | null)}
            />
            <MetricCard
              label="Quotes 7d change"
              value={formatDeltaPct(ds.trends.quotes.change_7d_pct as number | null)}
            />
            <MetricCard
              label="Swaps 7d change"
              value={formatDeltaPct(ds.trends.swaps.change_7d_pct as number | null)}
            />
          </div>
          <div className="grid lg:grid-cols-2 gap-4 mt-4">
            <PairTable
              title="Growing pairs (7d vs prior 7d)"
              rows={(ds.trends.pairs.last_7d_vs_prior_7d?.growing ?? []) as Array<Record<string, unknown>>}
              columns={[
                { key: 'pair_label', label: 'Pair' },
                { key: 'current', label: '7d' },
                { key: 'prior', label: 'Prior' },
                { key: 'change_pct', label: 'Change', render: (v) => formatDeltaPct(v as number | null) },
              ]}
            />
            <PairTable
              title="Declining pairs (7d vs prior 7d)"
              rows={(ds.trends.pairs.last_7d_vs_prior_7d?.declining ?? []) as Array<Record<string, unknown>>}
              columns={[
                { key: 'pair_label', label: 'Pair' },
                { key: 'current', label: '7d' },
                { key: 'prior', label: 'Prior' },
                { key: 'change_pct', label: 'Change', render: (v) => formatDeltaPct(v as number | null) },
              ]}
            />
          </div>
          <p className="text-[11px] text-dark-500 mt-2">{ds.trends.note}</p>
        </section>
      )}

      {data.alerts.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-dark-300">Recent Alerts</h2>
          {data.alerts.map((a) => (
            <div
              key={a.id}
              className={`rounded-lg border px-3 py-2 text-sm ${severityClass(a.severity)}`}
            >
              <p className="font-medium">{a.trigger}</p>
              <p className="text-[11px] mt-1 opacity-90">{a.action}</p>
            </div>
          ))}
        </section>
      )}

      {ds?.featured_automation && (
        <section>
          <h2 className="text-sm font-medium text-dark-300 mb-3">Featured Pair Recommendations</h2>
          <p className="text-[11px] text-dark-500 mb-3">{ds.featured_automation.scoring_note}</p>
          <div className="grid lg:grid-cols-2 gap-4">
            <PairTable
              title="Recommended featured (data-driven)"
              rows={ds.featured_automation.recommended_featured as Array<Record<string, unknown>>}
              columns={[
                { key: 'pair_label', label: 'Pair' },
                { key: 'score', label: 'Score' },
                { key: 'quotes_7d', label: 'Quotes 7d' },
                { key: 'reasoning', label: 'Reasoning' },
              ]}
            />
            <PairTable
              title="Recommended removal"
              rows={ds.featured_automation.recommended_removal as Array<Record<string, unknown>>}
              columns={[
                { key: 'pair_label', label: 'Pair' },
                { key: 'score', label: 'Score' },
                { key: 'quotes_7d', label: 'Quotes 7d' },
                { key: 'reasoning', label: 'Reasoning' },
              ]}
            />
          </div>
        </section>
      )}

      {ds?.insight_history && ds.insight_history.stored_days.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-dark-300 mb-3">Insight History</h2>
          <p className="text-xs text-dark-500 mb-2">
            Stored days: {ds.insight_history.stored_days.join(', ')}
          </p>
          <div className="grid sm:grid-cols-4 gap-3">
            {(['today', 'yesterday', 'days_7_ago', 'days_30_ago'] as const).map((key) => {
              const snap = ds.insight_history[key];
              if (!snap) return <MetricCard key={key} label={key.replace(/_/g, ' ')} value="—" />;
              return (
                <MetricCard
                  key={key}
                  label={key.replace(/_/g, ' ')}
                  value={`${snap.health_score ?? '—'} health · ${snap.commission_today_wei ?? 0} wei`}
                />
              );
            })}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-sm font-medium text-dark-300 mb-3">7-Day Overview</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricCard label="7d commission (wei sum)" value={comm7.toString()} />
          <MetricCard label="7d completed swaps" value={String(ex.completed_swaps_7d)} />
          <MetricCard label="Quote success rate" value={formatPct(ex.quote_success_rate_pct)} />
          <MetricCard
            label="Post-P4A quotes"
            value={String(ex.p4a_comparison.quote_success_post_deploy ?? 0)}
          />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium text-dark-300 mb-3">Conversion Funnel</h2>
        <div className="rounded-xl border border-dark-700 bg-dark-900/30 p-4">
          <div className="grid sm:grid-cols-5 gap-2">
            {data.funnel.stages.map((s) => (
              <div key={s.stage} className="rounded-lg bg-dark-800/50 p-3 text-center">
                <div className="text-[10px] text-dark-500 uppercase">{s.stage.replace(/_/g, ' ')}</div>
                <div className="text-xl font-mono mt-1">{s.count}</div>
                {s.conversion_from_prior_pct != null && (
                  <div className="text-[10px] text-cyan-400/80 mt-1">
                    {formatPct(s.conversion_from_prior_pct)} from prior
                  </div>
                )}
              </div>
            ))}
          </div>
          {data.funnel.largest_drop_off && (
            <p className="text-sm text-amber-200/90 mt-4">
              Largest drop-off: {data.funnel.largest_drop_off.from_stage} →{' '}
              {data.funnel.largest_drop_off.to_stage} ({data.funnel.largest_drop_off.drop_pct}%)
            </p>
          )}
        </div>
      </section>

      <section className="grid lg:grid-cols-2 gap-4">
        <PairTable
          title="Top requested pairs"
          rows={data.pairs.top_requested as Array<Record<string, unknown>>}
          columns={[
            { key: 'pair_label', label: 'Pair' },
            { key: 'count', label: 'Quotes' },
          ]}
        />
        <PairTable
          title="Top revenue pairs"
          rows={data.pairs.top_revenue as Array<Record<string, unknown>>}
          columns={[
            { key: 'pair_label', label: 'Pair' },
            { key: 'count', label: 'Fee wei', render: (v) => formatWeiShort(v as string) },
          ]}
        />
      </section>

      <section>
        <h2 className="text-sm font-medium text-dark-300 mb-3">Chain intelligence</h2>
        <PairTable
          title=""
          rows={data.chains as Array<Record<string, unknown>>}
          columns={[
            { key: 'chain_id', label: 'Chain', render: (v) => chainLabel(v as number) },
            { key: 'quotes', label: 'Quotes' },
            { key: 'unsupported_chain_selections', label: 'Unsupported sel.' },
            { key: 'completed_swaps', label: 'Swaps' },
            { key: 'recommendation', label: 'Recommendation' },
          ]}
        />
      </section>

      <section>
        <h2 className="text-sm font-medium text-dark-300 mb-3">Quality</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Object.entries(data.quality).map(([k, v]) => (
            <MetricCard key={k} label={k.replace(/_/g, ' ')} value={String(v)} />
          ))}
        </div>
      </section>

      {data._meta.limitations.length > 0 && (
        <section className="text-[11px] text-dark-500 space-y-1">
          <h2 className="text-sm font-medium text-dark-400">Limitations</h2>
          <ul className="list-disc pl-4">
            {data._meta.limitations.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export default OperatorIntelligencePage;
