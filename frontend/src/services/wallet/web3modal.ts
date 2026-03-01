import { createWeb3Modal, defaultConfig } from '@web3modal/ethers/react'

/**
 * Web3Modal singleton initializer.
 * Call initWeb3Modal() exactly once on app startup.
 */
let initialized = false

export function initWeb3Modal() {
  if (initialized) return
  initialized = true

  const projectId = import.meta.env.VITE_WC_PROJECT_ID
  if (!projectId || projectId === 'PASTE_YOUR_PROJECT_ID_HERE') {
    // Don't crash the app: read-only mode can still work.
    console.warn('[Web3Modal] Missing VITE_WC_PROJECT_ID. WalletConnect UI disabled.')
    return
  }

  const metadata = {
    name: 'Swaperex',
    description: 'Swaperex - Web3 Token Swap Platform',
    url: import.meta.env.VITE_APP_URL || 'https://dex.kobbex.com',
    icons: ['https://dex.kobbex.com/favicon.ico']
  }

  const mainnet = {
    chainId: 1,
    name: 'Ethereum',
    currency: 'ETH',
    explorerUrl: 'https://etherscan.io',
    rpcUrl: 'https://cloudflare-eth.com'
  }

  const bsc = {
    chainId: 56,
    name: 'BNB Chain',
    currency: 'BNB',
    explorerUrl: 'https://bscscan.com',
    rpcUrl: 'https://bsc-dataseed.binance.org'
  }

  const polygon = {
    chainId: 137,
    name: 'Polygon',
    currency: 'MATIC',
    explorerUrl: 'https://polygonscan.com',
    rpcUrl: 'https://polygon-rpc.com'
  }

  const arbitrum = {
    chainId: 42161,
    name: 'Arbitrum',
    currency: 'ETH',
    explorerUrl: 'https://arbiscan.io',
    rpcUrl: 'https://arb1.arbitrum.io/rpc'
  }

  const optimism = {
    chainId: 10,
    name: 'Optimism',
    currency: 'ETH',
    explorerUrl: 'https://optimistic.etherscan.io',
    rpcUrl: 'https://mainnet.optimism.io'
  }

  const avalanche = {
    chainId: 43114,
    name: 'Avalanche',
    currency: 'AVAX',
    explorerUrl: 'https://snowtrace.io',
    rpcUrl: 'https://api.avax.network/ext/bc/C/rpc'
  }

  createWeb3Modal({
    ethersConfig: defaultConfig({
      metadata,
      defaultChainId: 1,
      enableEIP6963: true,
      enableInjected: true,
      enableCoinbase: true
    }),
    chains: [mainnet, bsc, polygon, arbitrum, optimism, avalanche],
    projectId,
    enableAnalytics: false
  })
}
