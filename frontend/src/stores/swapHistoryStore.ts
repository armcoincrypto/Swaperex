/**
 * Swap History Store
 *
 * Legacy UI adapter: swap records are projected from the canonical transaction journal.
 * Transfer records (Send page) remain in this store until a future journal kind exists.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AssetInfo } from '@/types/api';
import { useTransactionJournalStore } from '@/stores/transactionJournalStore';
import { projectJournalToSwapRecords } from '@/utils/journalToSwapHistoryAdapter';

export interface SwapRecord {
  id: string;
  timestamp: number;
  chainId: number;
  fromAsset: AssetInfo;
  toAsset: AssetInfo;
  fromAmount: string;
  toAmount: string;
  minimumToAmount?: string;
  txHash: string;
  explorerUrl: string;
  status: 'success' | 'failed' | 'pending' | 'uncertain';
  provider: string;
  slippage: number;
  toAddress?: string;
}

interface SwapHistoryState {
  /** Device-local transfer records only (provider === 'transfer'). */
  transferRecords: SwapRecord[];
  /** Merged view: journal swaps + transfer records. */
  records: SwapRecord[];

  addRecord: (record: Omit<SwapRecord, 'id'>) => void;
  updateRecordStatus: (txHash: string, status: SwapRecord['status']) => void;
  getRecordsForChain: (chainId: number) => SwapRecord[];
  getRecentRecords: (limit?: number) => SwapRecord[];
  clearHistory: () => void;
  syncFromJournal: () => void;
}

const MAX_RECORDS = 100;

function mergeAndSortRecords(transfers: SwapRecord[], journalSwaps: SwapRecord[]): SwapRecord[] {
  const byHash = new Map<string, SwapRecord>();
  for (const record of journalSwaps) {
    byHash.set(record.txHash.toLowerCase(), record);
  }
  for (const transfer of transfers) {
    byHash.set(transfer.txHash.toLowerCase(), transfer);
  }
  return [...byHash.values()]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, MAX_RECORDS);
}

function legacyStatusToJournalEvent(status: SwapRecord['status']): 'confirmed' | 'reverted' | 'unknown' | null {
  if (status === 'success') return 'confirmed';
  if (status === 'failed') return 'reverted';
  if (status === 'uncertain') return 'unknown';
  return null;
}

export const useSwapHistoryStore = create<SwapHistoryState>()(
  persist(
    (set, get) => ({
      transferRecords: [],
      records: [],

      syncFromJournal: () => {
        const journalSwaps = projectJournalToSwapRecords(
          useTransactionJournalStore.getState().records,
        );
        set((state) => ({
          records: mergeAndSortRecords(state.transferRecords, journalSwaps),
        }));
      },

      addRecord: (record) => {
        if (record.provider !== 'transfer') {
          get().syncFromJournal();
          return;
        }

        set((state) => {
          const id = `${record.txHash}-${record.timestamp}`;
          const nextTransfer: SwapRecord = { ...record, id };
          const transferRecords = [
            nextTransfer,
            ...state.transferRecords.filter((r) => r.txHash !== record.txHash),
          ].slice(0, MAX_RECORDS);
          const journalSwaps = projectJournalToSwapRecords(
            useTransactionJournalStore.getState().records,
          );
          return {
            transferRecords,
            records: mergeAndSortRecords(transferRecords, journalSwaps),
          };
        });
      },

      updateRecordStatus: (txHash, status) => {
        const normalizedHash = txHash.toLowerCase();
        const journalRecord = useTransactionJournalStore
          .getState()
          .records.find((r) => r.kind === 'swap' && r.transactionHash === normalizedHash);

        if (journalRecord) {
          const journalStatus = legacyStatusToJournalEvent(status);
          if (journalStatus === 'confirmed') {
            useTransactionJournalStore.getState().applyConfirmedReceipt(journalRecord.id, {
              status: 1,
              blockNumber: journalRecord.blockNumber ?? 0,
              confirmedAt: new Date().toISOString(),
            });
          } else if (journalStatus === 'reverted') {
            useTransactionJournalStore.getState().applyRevertedReceipt(journalRecord.id, {
              status: 0,
              blockNumber: journalRecord.blockNumber ?? 0,
              confirmedAt: new Date().toISOString(),
            });
          } else if (journalStatus === 'unknown') {
            useTransactionJournalStore.getState().markTransactionUnknown(journalRecord.id);
          }
          get().syncFromJournal();
          return;
        }

        set((state) => ({
          transferRecords: state.transferRecords.map((r) =>
            r.txHash === txHash ? { ...r, status } : r,
          ),
        }));
        get().syncFromJournal();
      },

      getRecordsForChain: (chainId) => {
        get().syncFromJournal();
        return get().records.filter((r) => r.chainId === chainId);
      },

      getRecentRecords: (limit = 10) => {
        get().syncFromJournal();
        return get().records.slice(0, limit);
      },

      clearHistory: () => {
        set({ transferRecords: [], records: [] });
      },
    }),
    {
      name: 'swaperex-swap-history',
      version: 3,
      partialize: (state) => ({ transferRecords: state.transferRecords }),
      migrate: (persisted) => {
        const raw = persisted as { records?: SwapRecord[]; transferRecords?: SwapRecord[] };
        const legacyRecords = raw.transferRecords ?? raw.records ?? [];
        const transferRecords = legacyRecords.filter((r) => r.provider === 'transfer');
        return {
          transferRecords,
          records: transferRecords,
        };
      },
      onRehydrateStorage: () => (state) => {
        state?.syncFromJournal();
      },
    },
  ),
);

useTransactionJournalStore.subscribe(() => {
  useSwapHistoryStore.getState().syncFromJournal();
});

useSwapHistoryStore.getState().syncFromJournal();
