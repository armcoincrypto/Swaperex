/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Existing app
  readonly VITE_API_URL: string
  readonly VITE_SIGNALS_API_URL?: string

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

  // Vite flags
  readonly DEV: boolean
  readonly PROD: boolean
  readonly MODE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
