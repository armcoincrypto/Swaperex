/**
 * Status explanations and bounded formatting for transaction details.
 */

import type { UnifiedActivityStatus } from '@/types/unifiedActivity';
import { getChainById } from '@/config/chains';
import { shortenAddress, formatTxHash } from '@/utils/format';

export function presentStatusExplanation(status: UnifiedActivityStatus): string {
  switch (status) {
    case 'submitted':
      return 'The transaction hash was received, but no final receipt has been found yet.';
    case 'pending':
      return 'The transaction is still awaiting a final on-chain receipt.';
    case 'confirmed':
      return 'A successful on-chain receipt was found.';
    case 'reverted':
      return 'The chain returned an unsuccessful transaction receipt.';
    case 'unknown':
      return 'Swaperex could not verify the latest status because receipt lookup was inconclusive or the provider was unavailable.';
    case 'stale':
      return 'No final receipt has been found after the resolution window. This does not prove that the transaction failed.';
    default:
      return 'Status information is limited for this record.';
  }
}

export function maskWalletAddress(address: string): string {
  if (!address || address.length < 12) return address;
  return shortenAddress(address, 4);
}

export function formatDetailHash(hash: string): string {
  return formatTxHash(hash, 6);
}

export function resolveChainName(chainId: number): string {
  return getChainById(chainId)?.name ?? `Chain ${chainId}`;
}

export function boundString(value: string | undefined | null, max = 400): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

export function formatApprovalMode(mode: string): string {
  if (mode === 'unlimited') return 'Unlimited token approval';
  if (mode === 'reset-to-zero') return 'Reset to zero';
  return 'Exact amount';
}

export function formatReceiptStatus(status: number): string {
  return status === 1 ? 'Success' : 'Failed';
}

export function getBoundedClientMetadata(): { browser: string; os: string } {
  if (typeof navigator === 'undefined') {
    return { browser: 'unknown', os: 'unknown' };
  }
  const ua = navigator.userAgent;
  let browser = 'unknown';
  if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/Chrome\//i.test(ua)) browser = 'Chrome';
  else if (/Safari\//i.test(ua)) browser = 'Safari';

  let os = 'unknown';
  if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Mac OS X/i.test(ua)) os = 'macOS';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad/i.test(ua)) os = 'iOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  return { browser, os };
}
