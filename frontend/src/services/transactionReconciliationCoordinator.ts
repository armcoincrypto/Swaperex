/**
 * Bounded in-process reconciliation coordinator — single owner for refresh recovery.
 */

import type { TransactionJournalRecord } from '@/types/transactionJournal';
import { useTransactionJournalStore } from '@/stores/transactionJournalStore';
import {
  applyReconciliationResultToJournal,
  getReconciliationIntervalMs,
  MANUAL_RECHECK_COOLDOWN_MS,
  RECONCILIATION_MAX_CONCURRENCY,
} from '@/services/applyReconciliationToJournal';
import { resolveReconciliationProvider } from '@/services/reconciliationProvider';
import { reconcileKnownTransaction } from '@/services/transactionReconciliation';

export type ReconciliationTrigger =
  | 'app-mount'
  | 'wallet-connect'
  | 'visibility'
  | 'manual'
  | 'scheduled'
  | 'record-submitted';

type Listener = () => void;

const EMPTY_RECONCILING_IDS: ReadonlySet<string> = new Set();

class TransactionReconciliationCoordinator {
  private inFlight = new Map<string, Promise<void>>();
  private activeWaits = new Set<string>();
  private intervalIds = new Map<string, ReturnType<typeof setInterval>>();
  private manualCooldownUntil = 0;
  private walletAddress: string | null = null;
  private listeners = new Set<Listener>();
  private started = false;
  private reconcilingIdsSnapshot: ReadonlySet<string> = EMPTY_RECONCILING_IDS;
  private reconcilingIdsSnapshotKey = '';

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    this.refreshReconcilingIdsSnapshot();
    for (const listener of this.listeners) {
      listener();
    }
  }

  private refreshReconcilingIdsSnapshot(): void {
    const key = [...this.inFlight.keys()].sort().join('\0');
    if (key === this.reconcilingIdsSnapshotKey) return;
    this.reconcilingIdsSnapshotKey = key;
    this.reconcilingIdsSnapshot = key ? new Set(key.split('\0')) : EMPTY_RECONCILING_IDS;
  }

  getReconcilingRecordIds(): ReadonlySet<string> {
    return this.reconcilingIdsSnapshot;
  }

  registerActiveWait(recordId: string): void {
    this.activeWaits.add(recordId);
  }

  unregisterActiveWait(recordId: string): void {
    this.activeWaits.delete(recordId);
  }

  setWalletAddress(address: string | null): void {
    const normalized = address?.toLowerCase() ?? null;
    if (this.walletAddress === normalized) return;
    this.walletAddress = normalized;
    this.clearSchedules();
    if (normalized) {
      void this.reconcileWallet(normalized, 'wallet-connect');
    }
  }

  start(): void {
    if (this.started) return;
    this.started = true;

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && this.walletAddress) {
          void this.reconcileWallet(this.walletAddress, 'visibility');
        }
      });
    }
  }

  private clearSchedules(): void {
    for (const id of this.intervalIds.values()) {
      clearInterval(id);
    }
    this.intervalIds.clear();
  }

  private getUnresolvedForWallet(wallet: string): TransactionJournalRecord[] {
    return useTransactionJournalStore.getState().getPendingRecordsForWallet(wallet);
  }

  private scheduleRecord(record: TransactionJournalRecord): void {
    if (this.intervalIds.has(record.id)) return;
    const intervalMs = getReconciliationIntervalMs(record);
    if (!intervalMs) return;

    const timer = setInterval(() => {
      void this.reconcileRecord(record.id, 'scheduled');
    }, intervalMs);
    this.intervalIds.set(record.id, timer);
  }

  private refreshSchedules(wallet: string): void {
    this.clearSchedules();
    for (const record of this.getUnresolvedForWallet(wallet)) {
      this.scheduleRecord(record);
    }
  }

  async reconcileRecord(recordId: string, trigger: ReconciliationTrigger): Promise<void> {
    if (this.activeWaits.has(recordId)) return;

    const existing = this.inFlight.get(recordId);
    if (existing) return existing;

    const promise = this.runReconciliation(recordId, trigger).finally(() => {
      this.inFlight.delete(recordId);
      this.emit();
    });
    this.inFlight.set(recordId, promise);
    this.emit();
    return promise;
  }

  private async runReconciliation(recordId: string, trigger: ReconciliationTrigger): Promise<void> {
    const record = useTransactionJournalStore.getState().getRecordById(recordId);
    if (!record) return;
    if (!['submitted', 'pending', 'unknown', 'stale'].includes(record.status)) return;

    const provider = await resolveReconciliationProvider(record.chainId);
    if (!provider) {
      applyReconciliationResultToJournal(record, {
        kind: 'provider_error',
        error: { category: 'rpc_error', message: 'No read provider available' },
      }, trigger === 'manual' ? 'manual-refresh' : 'refresh-recovery');
      return;
    }

    const source =
      trigger === 'manual'
        ? 'manual-refresh'
        : trigger === 'scheduled'
          ? 'in-session-wait'
          : 'refresh-recovery';

    const result = await reconcileKnownTransaction(record, {
      readProvider: provider,
      checkTransactionExistence: true,
    });

    const latest = useTransactionJournalStore.getState().getRecordById(recordId);
    if (!latest) return;
    applyReconciliationResultToJournal(latest, result, source);

    const after = useTransactionJournalStore.getState().getRecordById(recordId);
    if (after && ['confirmed', 'reverted'].includes(after.status)) {
      const timer = this.intervalIds.get(recordId);
      if (timer) {
        clearInterval(timer);
        this.intervalIds.delete(recordId);
      }
    }
  }

  async reconcileWallet(walletAddress: string, trigger: ReconciliationTrigger): Promise<void> {
    useTransactionJournalStore.getState().runMigrationIfNeeded();
    const records = this.getUnresolvedForWallet(walletAddress);
    if (records.length === 0) return;

    this.refreshSchedules(walletAddress);

    const queue = [...records].sort(
      (a, b) => b.submittedAt.localeCompare(a.submittedAt),
    );

    let index = 0;
    const workers = Array.from({ length: RECONCILIATION_MAX_CONCURRENCY }, async () => {
      while (index < queue.length) {
        const current = queue[index++];
        await this.reconcileRecord(current.id, trigger);
      }
    });
    await Promise.all(workers);
    this.emit();
  }

  async manualRecheck(recordId: string): Promise<boolean> {
    const now = Date.now();
    if (now < this.manualCooldownUntil) return false;
    this.manualCooldownUntil = now + MANUAL_RECHECK_COOLDOWN_MS;
    await this.reconcileRecord(recordId, 'manual');
    return true;
  }
}

export const transactionReconciliationCoordinator = new TransactionReconciliationCoordinator();

export function registerJournalReconciliationActiveWait(recordId: string): void {
  transactionReconciliationCoordinator.registerActiveWait(recordId);
}

export function unregisterJournalReconciliationActiveWait(recordId: string): void {
  transactionReconciliationCoordinator.unregisterActiveWait(recordId);
}

export async function reconcileJournalRecordById(
  chainId: number,
  kind: 'approval' | 'swap',
  transactionHash: string,
  trigger: ReconciliationTrigger = 'record-submitted',
): Promise<void> {
  const id = `${chainId}:${kind}:${transactionHash.toLowerCase()}`;
  await transactionReconciliationCoordinator.reconcileRecord(id, trigger);
}
