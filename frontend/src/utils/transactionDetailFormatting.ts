/**
 * Status explanations and bounded formatting for transaction details.
 */

import type { UnifiedActivityStatus } from '@/types/unifiedActivity';
import type { JournalTransactionStatus } from '@/types/transactionJournal';
import { getChainById } from '@/config/chains';
import { shortenAddress, formatTxHash } from '@/utils/format';
import { getJournalStatusPresentation } from '@/utils/swaperexErrorPresentation';

export function presentStatusExplanation(status: UnifiedActivityStatus): string {
  if (status === 'confirmed') {
    return 'A successful on-chain receipt was found.';
  }
  return getJournalStatusPresentation(status as JournalTransactionStatus).description;
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
