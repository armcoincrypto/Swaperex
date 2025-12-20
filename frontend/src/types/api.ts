/**
 * API Response Types
 * Maps to backend /web/contracts/
 */

// ============ Chain Types ============

export interface ChainInfo {
  id: string;
  name: string;
  chain_id: number;
  native_asset: string;
  rpc_url: string;
  explorer_url: string;
  is_testnet: boolean;
}

export interface ChainListResponse {
  success: boolean;
  chains: ChainInfo[];
  total: number;
}

export interface AssetInfo {
  symbol: string;
  name: string;
  chain: string;
  decimals: number;
  is_native: boolean;
  contract_address?: string;
  logo_url?: string;
}

export interface AssetListResponse {
  success: boolean;
  assets: AssetInfo[];
  total: number;
}

// ============ Quote Types ============

export interface QuoteRequest {
  from_asset: string;
  to_asset: string;
  amount: string;
  slippage?: number;
}

export interface QuoteResponse {
  success: boolean;
  from_asset: string;
  to_asset: string;
  from_amount: string;
  to_amount: string;
  rate: string;
  price_impact?: string;
  provider: string;
  expires_at?: string;
  error?: string;
}

export interface MultiQuoteResponse {
  success: boolean;
  quotes: QuoteResponse[];
  best_quote?: QuoteResponse;
}

// ============ Balance Types ============

export interface TokenBalance {
  symbol: string;
  name?: string;
  contract_address?: string;
  balance: string;
  balance_raw: string;
  decimals: number;
  chain: string;
  usd_value?: string;
  logo_url?: string;
}

export interface WalletBalanceRequest {
  address: string;
  chain: string;
  include_tokens?: boolean;
  token_list?: string[];
}

export interface WalletBalanceResponse {
  success: boolean;
  address: string;
  chain: string;
  chain_id: number;
  native_balance: TokenBalance;
  token_balances: TokenBalance[];
  total_usd_value?: string;
  block_number?: number;
  timestamp?: string;
  error?: string;
}

export interface MultiChainBalanceRequest {
  address: string;
  chains: string[];
  include_tokens?: boolean;
}

export interface MultiChainBalanceResponse {
  success: boolean;
  address: string;
  chain_balances: WalletBalanceResponse[];
  total_usd_value?: string;
  failed_chains: string[];
}

// ============ Wallet Types ============

export type WalletType = 'walletconnect' | 'injected' | 'readonly' | 'hardware';

export interface ChainConnection {
  chain_id: number;
  chain_name: string;
  rpc_url?: string;
  is_connected: boolean;
}

export interface WalletSession {
  address: string;
  wallet_type: WalletType;
  chain_id: number;
  connected_chains: ChainConnection[];
  session_id?: string;
  peer_metadata?: Record<string, unknown>;
  can_sign_messages: boolean;
  can_sign_transactions: boolean;
  can_sign_typed_data: boolean;
  is_read_only: boolean;
}

export interface ConnectWalletRequest {
  address: string;
  chain_id?: number;
  wallet_type?: WalletType;
  session_id?: string;
  is_read_only?: boolean;
}

export interface ConnectWalletResponse {
  success: boolean;
  session?: WalletSession;
  error?: string;
}

export interface WalletCapabilities {
  can_query_balance: boolean;
  can_sign_messages: boolean;
  can_sign_transactions: boolean;
  can_sign_typed_data: boolean;
  can_batch_transactions: boolean;
  can_sponsor_gas: boolean;
  can_delegate: boolean;
  supported_chains: number[];
}

// ============ Transaction Types ============

export interface UnsignedTransaction {
  chain: string;
  chain_id: number;
  to: string;
  value: string;
  data: string;
  gas_limit?: string;
  gas_price?: string;
  max_fee_per_gas?: string;
  max_priority_fee_per_gas?: string;
  nonce?: number;
  description?: string;
}

export interface TransactionRequest {
  action: 'approve' | 'transfer' | 'swap';
  chain: string;
  from_address: string;
  params: Record<string, unknown>;
}

// ============ Swap Types ============

export interface GasEstimate {
  gas_limit: string;
  gas_price: string;
  max_fee_per_gas?: string;
  max_priority_fee_per_gas?: string;
  estimated_cost_native: string;
  estimated_cost_usd?: string;
}

export interface SwapRouteMetadata {
  provider: string;
  route_path: string[];
  hops: number;
  price_impact: string;
  minimum_received: string;
  expires_at: string;
}

export interface UnsignedSwapTransaction {
  chain: string;
  chain_id: number;
  to: string;
  value: string;
  data: string;
  gas_estimate: GasEstimate;
  route_metadata: SwapRouteMetadata;
  description: string;
  warnings: string[];
}

export interface SwapQuoteRequest {
  from_asset: string;
  to_asset: string;
  amount: string;
  from_address: string;
  slippage?: number;
  deadline_minutes?: number;
}

export interface SwapQuoteResponse {
  success: boolean;
  from_asset: string;
  to_asset: string;
  from_amount: string;
  to_amount: string;
  rate: string;
  price_impact: string;
  minimum_received: string;
  route: SwapRouteMetadata;
  gas_estimate: GasEstimate;
  transaction?: UnsignedSwapTransaction;
  approval_needed?: boolean;
  approval_transaction?: UnsignedTransaction;
  error?: string;
}

// Alias for backward compatibility
export type SwapQuote = SwapQuoteResponse;

// ============ Withdrawal Types ============

export interface WithdrawalFeeEstimate {
  network_fee: string;
  network_fee_asset: string;
  network_fee_usd?: string;
  protocol_fee?: string;
  protocol_fee_asset?: string;
  total_fee: string;
  total_fee_usd?: string;
}

export interface UnsignedWithdrawalTransaction {
  chain: string;
  chain_id: number;
  to: string;
  value: string;
  data: string;
  gas_limit?: string;
  gas_price?: string;
  max_fee_per_gas?: string;
  max_priority_fee_per_gas?: string;
  raw_unsigned?: string;
  inputs?: Array<Record<string, unknown>>;
  outputs?: Array<Record<string, unknown>>;
  description: string;
  warnings: string[];
}

export interface WithdrawalRequest {
  asset: string;
  amount: string;
  destination_address: string;
  from_address: string;
  chain?: string;
}

export interface WithdrawalResponse {
  success: boolean;
  asset: string;
  amount: string;
  destination: string;
  net_amount?: string;
  fee_estimate?: WithdrawalFeeEstimate;
  transaction?: UnsignedWithdrawalTransaction;
  is_token_transfer: boolean;
  token_contract?: string;
  error?: string;
}
