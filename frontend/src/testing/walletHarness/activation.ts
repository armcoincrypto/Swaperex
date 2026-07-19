/**
 * P21.4 — Activation guards for the test wallet harness.
 * Production must fail closed.
 */

export type WalletHarnessActivationInput = {
  mode?: string;
  viteEnableTestWallet?: string;
  hostname?: string;
  isTestRunner?: boolean;
  /** Explicitly mark production builds */
  prod?: boolean | string;
};

export const TEST_WALLET_FAKE_ACCOUNTS = [
  '0xa11ce00000000000000000000000000000000001',
  '0xb0b0000000000000000000000000000000000002',
] as const;

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

/**
 * All conditions must be true. Missing any condition → disabled.
 */
export function isWalletHarnessActivationAllowed(input: WalletHarnessActivationInput): boolean {
  if (input.prod === true || input.prod === 'true' || input.prod === '1') {
    return false;
  }
  if (input.mode === 'production') {
    return false;
  }
  const nonProductionBuild =
    input.mode === 'test' ||
    input.mode === 'development' ||
    input.mode === 'preview' ||
    input.mode === 'e2e';
  if (!nonProductionBuild) {
    return false;
  }
  if (input.viteEnableTestWallet !== 'true') {
    return false;
  }
  if (!input.isTestRunner) {
    return false;
  }
  const host = (input.hostname || '').toLowerCase();
  if (!LOCAL_HOSTS.has(host)) {
    return false;
  }
  return true;
}

/** Default mode is always no_broadcast — never imply simulation. */
export function resolveWalletTestMode(
  raw: string | undefined | null,
): 'no_broadcast' | 'simulated_receipt' {
  if (raw === 'simulated_receipt') return 'simulated_receipt';
  return 'no_broadcast';
}

export function assertHarnessCannotActivateInProduction(): void {
  const blocked = !isWalletHarnessActivationAllowed({
    mode: 'production',
    viteEnableTestWallet: 'true',
    hostname: '127.0.0.1',
    isTestRunner: true,
    prod: true,
  });
  if (!blocked) {
    throw new Error('P21.4 guard failure: harness must not activate in production');
  }
}
