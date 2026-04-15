import type { EIP1193Provider } from '@/wallet';

/** Shared ref for the live EIP-1193 provider from Reown AppKit (WalletConnect). Kept out of AppKitBridge so useWallet does not import @reown. */
export const appKitProviderRef = { current: null as EIP1193Provider | null };
