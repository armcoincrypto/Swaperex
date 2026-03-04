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

  // Vite flags
  readonly DEV: boolean
  readonly PROD: boolean
  readonly MODE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
