/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Existing app
  readonly VITE_API_URL: string
  /** Override admin panel API root (default `/api/v1`). Production normally unchanged. */
  readonly VITE_ADMIN_API_BASE_URL?: string
  readonly VITE_SIGNALS_API_URL?: string

  /** Optional override for Ethereum read-only JSON-RPC (https). When unset, public fallbacks from `config/rpc` are used. */
  readonly VITE_ETHEREUM_RPC_URL?: string

  /** Optional override for BSC read-only JSON-RPC (https). When unset, public fallbacks from `config/rpc` are used. */
  readonly VITE_BSC_RPC_URL?: string

  /** Optional comma-separated extra BSC read RPC URLs (https), merged after `VITE_BSC_RPC_URL`. */
  readonly VITE_BSC_READ_RPC_URLS?: string

  // WalletConnect Cloud project ID — required for QR/mobile wallets (get at cloud.walletconnect.com)
  readonly VITE_WC_PROJECT_ID?: string
  readonly VITE_WALLETCONNECT_PROJECT_ID?: string  // legacy alias

  // Optional metadata for WalletConnect
  readonly VITE_APP_URL?: string

  /** When `true`, POST /wallet/connect and /wallet/disconnect are used (optional backend session API). */
  readonly VITE_ENABLE_WALLET_SESSION_API?: string

  /** When `true`, log legacy WC autoReconnect phases in production (see connectors.ts). DEV logs by default. */
  readonly VITE_LEGACY_WC_AUTORECONNECT_OBSERVABILITY?: string

  /** Phase 1: enable 1inch integrator fee (requires valid recipient + feeBps > 0). */
  readonly VITE_FEE_ENABLED?: string
  /** Platform fee in basis points (100 = 1%). Clamped to 0–300 (max 3% per 1inch). Default 0. */
  readonly VITE_FEE_BPS?: string
  /** EVM address that receives the integrator fee (1inch `referrer`). */
  readonly VITE_FEE_RECIPIENT?: string

  /** When truthy (1/true/yes/on), Ethereum ERC20→ERC20 swaps that would execute on Uniswap V3 use the fee wrapper. Default: off. */
  readonly VITE_UNISWAP_WRAPPER_ENABLED?: string
  /** Deployed SwaperexUniswapV3FeeWrapper on Ethereum mainnet (checksummed). Required when wrapper is enabled. */
  readonly VITE_UNISWAP_WRAPPER_ADDRESS?: string
  /** Wrapper output fee in bps for UI copy only; should match on-chain `FEE_BPS` (default 20). */
  readonly VITE_UNISWAP_WRAPPER_FEE_BPS?: string

  /** Uniswap wrapper V2 (Ethereum). Default: off. */
  readonly VITE_UNISWAP_WRAPPER_V2_ENABLED?: string
  readonly VITE_UNISWAP_WRAPPER_V2_ADDRESS?: string
  readonly VITE_UNISWAP_WRAPPER_V2_FEE_BPS?: string
  readonly VITE_UNISWAP_WRAPPER_V2_NATIVE_ENABLED?: string
  readonly VITE_UNISWAP_WRAPPER_V2_NATIVE_QUOTE_ENABLED?: string
  readonly VITE_UNISWAP_WRAPPER_V2_NATIVE_CANARY_PCT?: string
  /** When truthy with native execution on, UI shows an experimental-routing banner (Phase 3 canary). */
  readonly VITE_UNISWAP_WRAPPER_V2_NATIVE_EXPERIMENTAL_UI?: string

  /** Uniswap wrapper V3 (Ethereum, multi-hop `exactInput`). Default: off. */
  readonly VITE_UNISWAP_WRAPPER_V3_ENABLED?: string
  readonly VITE_UNISWAP_WRAPPER_V3_ADDRESS?: string
  /** Optional UI copy; should match on-chain `feeBps` (default 20). */
  readonly VITE_UNISWAP_WRAPPER_V3_FEE_BPS?: string
  /**
   * Comma-separated allowlist segments, e.g. `WETH-USDC,WETH-USDC-SNX,WETH-USDC-PENDLE`.
   * When unset and V3 is enabled, a built-in default list is used (same three paths).
   */
  readonly VITE_UNISWAP_WRAPPER_V3_CANARY_PAIRS?: string

  /** When truthy (1/true/yes/on), BSC ERC20→ERC20 swaps that would execute on direct PancakeSwap V3 use the fee wrapper. Default: off. */
  readonly VITE_PANCAKE_WRAPPER_ENABLED?: string
  /** Deployed Swaperex Pancake V3 fee wrapper on BSC (checksummed). Required when wrapper is enabled. */
  readonly VITE_PANCAKE_WRAPPER_ADDRESS?: string
  /** Wrapper output fee in bps for UI copy only; should match on-chain `FEE_BPS` (default 50). */
  readonly VITE_PANCAKE_WRAPPER_FEE_BPS?: string

  /** When truthy, BSC Pancake wrapper V2 routes are enabled. */
  readonly VITE_PANCAKE_WRAPPER_V2_ENABLED?: string
  /** Deployed Swaperex Pancake V3 fee wrapper V2 on BSC (checksummed). */
  readonly VITE_PANCAKE_WRAPPER_V2_ADDRESS?: string
  /** Wrapper V2 output fee in bps for UI copy only; should match on-chain `feeBps` (default 50). */
  readonly VITE_PANCAKE_WRAPPER_V2_FEE_BPS?: string
  /** When truthy, wrapper V2 native entrypoints may be executed (native BNB legs). Default: off. */
  readonly VITE_PANCAKE_WRAPPER_V2_NATIVE_ENABLED?: string

  /** When truthy, wrapper V2 native legs may be quoted (manual-route testing gate). Default: off. */
  readonly VITE_PANCAKE_WRAPPER_V2_NATIVE_QUOTE_ENABLED?: string
  /** Future: native-leg canary pct for best-route participation (0..1). Default 0. */
  readonly VITE_PANCAKE_WRAPPER_V2_NATIVE_CANARY_PCT?: string

  /** Existing: canary pct for ERC20↔ERC20 wrapper-v2 participation in “best” route (0..1). Default 0. */
  readonly VITE_PANCAKE_WRAPPER_V2_CANARY_PCT?: string

  /** When truthy, swaps must use commission-capable routes or be blocked. Default: off. */
  readonly VITE_COMMISSION_REQUIRED?: string

  /** When truthy, enables verbose swap fetch / lifecycle / [swap:obs] console output. Default: off in production. */
  readonly VITE_DEBUG_SWAP?: string

  /** When truthy, POST monitoring outbox to the ingest URL. Default off when unset (no production POST). */
  readonly VITE_MONITORING_INGEST_ENABLED?: string

  /** When truthy with DEV false, mirror `logProductionEvent` rows to the console. */
  readonly VITE_DEBUG_MONITORING?: string

  /**
   * Production-only: mirror wallet reconnect telemetry (`logWalletReconnectTelemetry`) to the console.
   * Does not enable full `VITE_DEBUG_MONITORING`. DEV already logs persisted monitoring rows by default.
   */
  readonly VITE_DEBUG_WALLET_RECONNECT?: string

  /** When truthy with DEV false, log walletEvents.emit details to the console. */
  readonly VITE_DEBUG_WALLET?: string

  // Vite flags
  readonly DEV: boolean
  readonly PROD: boolean
  readonly MODE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
