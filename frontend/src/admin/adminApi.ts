/**
 * Admin panel API — isolated admin FastAPI.
 * Production: same-origin `/api/v1/admin/*` (nginx → :8001).
 * Dev: Vite proxies `/api/v1/admin` → :8001 (see vite.config.ts).
 */
export const ADMIN_API_ROOT: string = (
  import.meta.env.VITE_ADMIN_API_BASE_URL ?? '/api/v1'
).replace(/\/+$/, '');

export const ADMIN_TOKEN_SESSION_KEY = 'swaperex_admin_x_admin_token';

export function getStoredAdminToken(): string | null {
  try {
    return sessionStorage.getItem(ADMIN_TOKEN_SESSION_KEY);
  } catch {
    return null;
  }
}

export function setStoredAdminToken(token: string): void {
  sessionStorage.setItem(ADMIN_TOKEN_SESSION_KEY, token);
}

export function clearStoredAdminToken(): void {
  sessionStorage.removeItem(ADMIN_TOKEN_SESSION_KEY);
}

/** Join admin API root (…/api/v1) with `admin/...` paths. */
export function adminApiUrl(pathUnderAdmin: string): string {
  const p = pathUnderAdmin.replace(/^\/+/, '');
  return `${ADMIN_API_ROOT}/${p}`;
}

export type AdminOverviewResponse = {
  service: string;
  status: string;
  monitoring_batch_count: number;
  monitoring_latest_received_at: string | null;
  frontend_health: { status: string; note: string };
};

async function adminFetch(path: string, token: string): Promise<Response> {
  return fetch(adminApiUrl(path), {
    headers: {
      Accept: 'application/json',
      'X-Admin-Token': token,
    },
  });
}

export async function fetchAdminHealth(token: string): Promise<void> {
  const res = await adminFetch('admin/health', token);
  if (!res.ok) throw new Error(`admin health ${res.status}`);
}

export async function fetchAdminOverview(token: string): Promise<AdminOverviewResponse> {
  const res = await adminFetch('admin/overview', token);
  if (!res.ok) throw new Error(`admin overview ${res.status}`);
  return (await res.json()) as AdminOverviewResponse;
}

export type AdminEventsBatchItem = {
  id: number;
  received_at: string;
  client_session_id: string;
  event_count: number;
  schema_version: number;
  event_names: string[];
  raw?: Record<string, unknown>;
};

export type AdminEventsResponse = {
  items: AdminEventsBatchItem[];
  total: number;
  limit: number;
  offset: number;
};

export type AdminEventsQuery = {
  limit?: number;
  offset?: number;
  event?: string;
  clientSessionId?: string;
  includeRaw?: boolean;
};

export async function fetchAdminEvents(
  token: string,
  params: AdminEventsQuery = {},
): Promise<AdminEventsResponse> {
  const q = new URLSearchParams();
  if (params.limit != null) q.set('limit', String(params.limit));
  if (params.offset != null) q.set('offset', String(params.offset));
  const ev = params.event?.trim();
  if (ev) q.set('event', ev);
  const sid = params.clientSessionId?.trim();
  if (sid) q.set('clientSessionId', sid);
  if (params.includeRaw) q.set('includeRaw', '1');
  const qs = q.toString();
  const path = qs ? `admin/events?${qs}` : 'admin/events';
  const res = await adminFetch(path, token);
  if (!res.ok) throw new Error(`admin events ${res.status}`);
  return (await res.json()) as AdminEventsResponse;
}

/** Flattened swap_success row from GET /api/v1/admin/swaps */
export type AdminSwapAnalyticsRow = {
  batch_id: number;
  timestamp: string;
  client_session_id: string;
  chain: number | null;
  route_mode: string | null;
  wrapper_route: string | null;
  commission_route: string | null;
  from_symbol: string | null;
  to_symbol: string | null;
  from_amount: string | null;
  quoted_output: string | null;
  minimum_received: string | null;
  protocol_fee_bps: number | null;
  user_received_source: string | null;
  gas_used: string | null;
  effective_gas_price: string | null;
  receipt_status: number | null;
  tx_hash: string | null;
  native_output: boolean;
  estimated_fee_usd: number | null;
  route_label: string;
  provider: string | null;
  raw_event: Record<string, unknown>;
};

export type AdminSwapsResponse = {
  items: AdminSwapAnalyticsRow[];
  total: number;
  limit: number;
  offset: number;
};

export type AdminSwapsQuery = {
  limit?: number;
  offset?: number;
  chain?: number;
  routeMode?: string;
  token?: string;
  walletSession?: string;
  successOnly?: boolean;
};

export async function fetchAdminSwaps(token: string, params: AdminSwapsQuery = {}): Promise<AdminSwapsResponse> {
  const q = new URLSearchParams();
  if (params.limit != null) q.set('limit', String(params.limit));
  if (params.offset != null) q.set('offset', String(params.offset));
  if (params.chain != null) q.set('chain', String(params.chain));
  const rm = params.routeMode?.trim();
  if (rm) q.set('routeMode', rm);
  const tk = params.token?.trim();
  if (tk) q.set('token', tk);
  const ws = params.walletSession?.trim();
  if (ws) q.set('walletSession', ws);
  if (params.successOnly === false) q.set('successOnly', 'false');
  const qs = q.toString();
  const path = qs ? `admin/swaps?${qs}` : 'admin/swaps';
  const res = await adminFetch(path, token);
  if (!res.ok) throw new Error(`admin swaps ${res.status}`);
  return (await res.json()) as AdminSwapsResponse;
}

export type AdminRevenueTokenBucket = {
  symbol: string;
  address: string | null;
  is_native: boolean;
  raw_total: string;
  decimals_note: string;
};

export type AdminRevenueChainBucket = AdminRevenueTokenBucket & {
  chain_id: number;
};

export type AdminRevenueRouteBucket = AdminRevenueTokenBucket & {
  chain_id: number;
  route_label: string;
  provider: string | null;
  route_mode: string | null;
  wrapper_route: string | null;
  commission_route: string | null;
};

export type AdminRevenueLatestFeeEvent = {
  timestamp: string;
  chain_id: number;
  route_label: string;
  provider: string | null;
  route_mode: string | null;
  fee_token_symbol: string;
  fee_token_address: string | null;
  fee_token_is_native: boolean;
  raw_fee_wei: string;
  protocol_fee_bps: number | null;
  tx_hash: string | null;
  commission_route: string | null;
  wrapper_route: string | null;
};

export type AdminRevenueResponse = {
  total_swaps: number;
  enriched_swaps_count: number;
  swaps_with_fee_data: number;
  missing_fee_data: number;
  total_fee_by_token: AdminRevenueTokenBucket[];
  revenue_by_chain: AdminRevenueChainBucket[];
  revenue_by_route: AdminRevenueRouteBucket[];
  latest_fee_events: AdminRevenueLatestFeeEvent[];
};

export async function fetchAdminRevenue(token: string): Promise<AdminRevenueResponse> {
  const res = await adminFetch('admin/revenue', token);
  if (!res.ok) throw new Error(`admin revenue ${res.status}`);
  return (await res.json()) as AdminRevenueResponse;
}

export type AdminRevenueNormalizedCoverage = {
  total_fee_events: number;
  normalized_count: number;
  missing_decimals_count: number;
  invalid_raw_value_count: number;
  unsupported_token_count: number;
  unknown_count: number;
  coverage_pct: number;
};

export type AdminRevenueNormalizedTokenBucket = {
  chain_id: number;
  token_symbol: string;
  token_address: string | null;
  is_native: boolean;
  raw_fee_wei_total: string;
  normalized_amount_total: string | null;
  normalized_event_count: number;
  bucket_event_count: number;
  normalization_status: string;
  status_mix: Record<string, number>;
};

export type AdminRevenueNormalizedChainBucket = {
  chain_id: number;
  raw_fee_wei_total: string;
  normalized_amount_total: string | null;
};

export type AdminRevenueNormalizedRouteBucket = {
  chain_id: number;
  route_label: string;
  provider: string | null;
  route_mode: string | null;
  wrapper_route: string | null;
  commission_route: string | null;
  raw_fee_wei_total: string;
  normalized_amount_total: string | null;
};

export type AdminRevenueNormalizedFeeEvent = {
  timestamp: string;
  chain_id: number;
  token_symbol: string;
  token_address: string | null;
  fee_token_is_native: boolean;
  raw_fee_wei: string | null;
  normalized_amount: string | null;
  decimals: number | null;
  decimals_source: string | null;
  normalization_status: string;
  protocol_fee_bps: number | null;
  provider: string | null;
  route_mode: string | null;
  wrapper_route: string | null;
  commission_route: string | null;
  route_label: string;
  tx_hash: string | null;
};

export type AdminRevenueNormalizedResponse = {
  normalization_schema_version: string;
  coverage: AdminRevenueNormalizedCoverage;
  totals_by_token: AdminRevenueNormalizedTokenBucket[];
  totals_by_chain: AdminRevenueNormalizedChainBucket[];
  totals_by_route: AdminRevenueNormalizedRouteBucket[];
  recent_normalized_fee_events: AdminRevenueNormalizedFeeEvent[];
  _meta: { notes: string[]; decimals_registry_chains: number[] };
};

export async function fetchAdminRevenueNormalized(token: string): Promise<AdminRevenueNormalizedResponse> {
  const res = await adminFetch('admin/revenue-normalized', token);
  if (!res.ok) throw new Error(`admin revenue-normalized ${res.status}`);
  return (await res.json()) as AdminRevenueNormalizedResponse;
}

export type AdminRevenueReconciliationSummary = {
  total_swap_success_events: number;
  wrapper_swap_events: number;
  events_with_observed_fee: number;
  events_with_zero_fee: number;
  events_missing_fee_fields: number;
  events_with_expected_fee_bps: number;
  events_reconciled_ok: number;
  events_warning: number;
  events_critical: number;
};

export type AdminRevenueReconciliationExpectedRow = {
  chain_id: number;
  provider: string;
  expected_fee_bps: number;
  source: string;
  treasury_address_expected: string;
};

export type AdminRevenueReconciliationEventRow = {
  time: string;
  tx_hash: string | null;
  chain_id: number;
  provider: string | null;
  route_mode: string | null;
  wrapper_type: string | null;
  pair: string;
  input_amount: string | null;
  output_amount: string | null;
  expected_fee_bps: number | null;
  expected_fee_bps_source: string | null;
  telemetry_protocol_fee_bps: number | null;
  observed_fee_raw: string | null;
  observed_fee_normalized: string | null;
  fee_token: Record<string, unknown> | null;
  normalization_status: string;
  reconciliation_status: string;
  severity: string;
  reasons: string[];
  checks: Record<string, boolean>;
};

export type AdminRevenueReconciliationResponse = {
  schema_version: string;
  summary: AdminRevenueReconciliationSummary;
  expected_fee_config: AdminRevenueReconciliationExpectedRow[];
  checks: Record<string, string>;
  recent_reconciliation_events: AdminRevenueReconciliationEventRow[];
  _meta: { notes: string[] };
};

export async function fetchAdminRevenueReconciliation(
  token: string,
): Promise<AdminRevenueReconciliationResponse> {
  const res = await adminFetch('admin/revenue-reconciliation', token);
  if (!res.ok) throw new Error(`admin revenue-reconciliation ${res.status}`);
  return (await res.json()) as AdminRevenueReconciliationResponse;
}

export type AdminSwapLifecyclePhaseRow = {
  phase: string;
  time: string;
  event_name: string;
  metadata: Record<string, unknown>;
};

export type AdminSwapLifecycleRow = {
  lifecycle_id: string;
  session_id: string;
  status: string;
  severity: string;
  chain_id: number | null;
  provider: string | null;
  route_mode: string | null;
  pair: string;
  wallet_address: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_ms: number;
  tx_hash: string | null;
  phases: AdminSwapLifecyclePhaseRow[];
  issues: string[];
  checks: Record<string, boolean>;
};

export type AdminSwapLifecyclesSummary = {
  total_lifecycles: number;
  completed: number;
  rejected: number;
  pending: number;
  failed: number;
  incomplete: number;
  orphaned: number;
  unknown: number;
  avg_duration_ms: number;
  p95_duration_ms: number;
};

export type AdminSwapLifecyclesQuery = {
  status?: string;
  provider?: string;
  chain?: number;
  swapLifecycleId?: string;
  txHash?: string;
  maxBatches?: number;
};

export type AdminSwapLifecyclesResponse = {
  schema_version: string;
  summary: AdminSwapLifecyclesSummary;
  phase_definitions: Array<{ phase: string; description: string }>;
  recent_lifecycles: AdminSwapLifecycleRow[];
  _meta: { notes: string[] };
};

export async function fetchAdminSwapLifecycles(
  token: string,
  params: AdminSwapLifecyclesQuery = {},
): Promise<AdminSwapLifecyclesResponse> {
  const q = new URLSearchParams();
  if (params.status?.trim()) q.set('status', params.status.trim());
  if (params.provider?.trim()) q.set('provider', params.provider.trim());
  if (params.chain != null) q.set('chain', String(params.chain));
  if (params.swapLifecycleId?.trim()) q.set('swap_lifecycle_id', params.swapLifecycleId.trim());
  if (params.txHash?.trim()) q.set('tx_hash', params.txHash.trim());
  if (params.maxBatches != null) q.set('maxBatches', String(params.maxBatches));
  const qs = q.toString();
  const path = qs ? `admin/swap-lifecycles?${qs}` : 'admin/swap-lifecycles';
  const res = await adminFetch(path, token);
  if (!res.ok) throw new Error(`admin swap-lifecycles ${res.status}`);
  return (await res.json()) as AdminSwapLifecyclesResponse;
}

export type AdminHealthAlertsWindow = {
  max_batches: number;
  event_count: number;
  oldest_event_time: string | null;
  newest_event_time: string | null;
};

export type AdminHealthAlertsOverall = {
  status: string;
  score: number;
  highest_severity: string;
  generated_at: string;
  window: AdminHealthAlertsWindow;
};

export type AdminHealthCheckRow = {
  id: string;
  label: string;
  status: string;
  severity: string;
  value: string;
  threshold: string;
  reason: string;
  evidence: Record<string, unknown>;
};

export type AdminHealthAlertRow = {
  id: string;
  severity: string;
  category: string;
  title: string;
  message: string;
  evidence: Record<string, unknown>;
  recommended_action: string;
};

export type AdminHealthAlertsMetrics = {
  total_events: number;
  swap_success_count: number;
  wallet_rejected_count: number;
  quote_failure_count: number;
  lifecycle_total: number;
  lifecycle_incomplete_count: number;
  lifecycle_orphaned_count: number;
  revenue_telemetry_zero_fee_count: number;
  revenue_telemetry_missing_fee_count: number;
};

export type AdminHealthAlertsResponse = {
  schema_version: string;
  overall: AdminHealthAlertsOverall;
  checks: AdminHealthCheckRow[];
  alerts: AdminHealthAlertRow[];
  metrics: AdminHealthAlertsMetrics;
  _meta: { notes: string[] };
};

export async function fetchAdminHealthAlerts(
  token: string,
  params: { maxBatches?: number } = {},
): Promise<AdminHealthAlertsResponse> {
  const q = new URLSearchParams();
  if (params.maxBatches != null) q.set('maxBatches', String(params.maxBatches));
  const qs = q.toString();
  const path = qs ? `admin/health-alerts?${qs}` : 'admin/health-alerts';
  const res = await adminFetch(path, token);
  if (!res.ok) throw new Error(`admin health-alerts ${res.status}`);
  return (await res.json()) as AdminHealthAlertsResponse;
}

export type AdminWalletReconnectTotals = {
  scans: number;
  appkit_success: number;
  legacy_attempts: number;
  legacy_success: number;
  legacy_failures: number;
};

export type AdminWalletReconnectFailureRow = {
  timestamp: string;
  client_session_id: string;
  reason: string;
  last_connector: string | null;
  wc_project_id_configured: boolean | null;
};

export type AdminWalletReconnectSessionRow = {
  client_session_id: string;
  latest_event: string;
  reconnect_count: number;
  appkit_connected: boolean;
  last_seen_at: string;
};

export type AdminWalletReconnectTimelineRow = {
  minute_bucket: string;
  scans: number;
  successes: number;
  failures: number;
};

export type AdminWalletReconnectResponse = {
  totals: AdminWalletReconnectTotals;
  reconnect_success_rate: number | null;
  recent_failures: AdminWalletReconnectFailureRow[];
  recent_sessions: AdminWalletReconnectSessionRow[];
  reconnect_timeline: AdminWalletReconnectTimelineRow[];
};

export async function fetchAdminWalletReconnect(token: string): Promise<AdminWalletReconnectResponse> {
  const res = await adminFetch('admin/wallet-reconnect', token);
  if (!res.ok) throw new Error(`admin wallet-reconnect ${res.status}`);
  return (await res.json()) as AdminWalletReconnectResponse;
}

export type AdminFailureRates = {
  wallet_rejection_rate: number | null;
  provider_timeout_rate: number | null;
  rpc_failure_rate: number | null;
  stale_quote_rate: number | null;
};

export type AdminFailureRow = {
  timestamp: string;
  failure_type: string;
  severity: string;
  event_name: string;
  reason_code: string;
  chain_id: number | null;
  provider: string | null;
  route_mode: string | null;
  batch_id: number;
  client_session_id: string;
  tx_hash: string | null;
  payload_excerpt: Record<string, unknown>;
};

export type AdminFailureTypeBucket = { failure_type: string; count: number };
export type AdminFailureChainBucket = { chain_id: number; count: number };
export type AdminFailureProviderBucket = { provider: string; count: number };

export type AdminFailureTimelineRow = {
  hour_bucket: string;
  total: number;
  by_type: Record<string, number>;
};

export type AdminFailuresResponse = {
  failure_taxonomy_version: string;
  total_failures: number;
  failures_by_type: AdminFailureTypeBucket[];
  failures_by_chain: AdminFailureChainBucket[];
  failures_by_provider: AdminFailureProviderBucket[];
  recent_failures: AdminFailureRow[];
  recent_commission_missing: AdminFailureRow[];
  failure_timeline: AdminFailureTimelineRow[];
  rates: AdminFailureRates;
  _meta: { notes: string[]; unavailable_metrics: string[] };
};

export async function fetchAdminFailures(token: string): Promise<AdminFailuresResponse> {
  const res = await adminFetch('admin/failures', token);
  if (!res.ok) throw new Error(`admin failures ${res.status}`);
  return (await res.json()) as AdminFailuresResponse;
}
