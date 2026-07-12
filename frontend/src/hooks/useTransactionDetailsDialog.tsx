/**
 * Hook for opening the shared transaction details dialog from activity surfaces.
 */

import { useCallback, useMemo, useState } from 'react';
import { TransactionDetailsDialog } from '@/components/transactions/TransactionDetailsDialog';
import { useSwapHistoryStore } from '@/stores/swapHistoryStore';
import { useTransactionJournalStore } from '@/stores/transactionJournalStore';
import { useWalletStore } from '@/stores/walletStore';
import {
  buildDetailFromJournalRecord,
  buildDetailFromRecoveredTrace,
  buildDetailFromUnifiedActivity,
  buildFlowDetailModels,
} from '@/services/transactionDetailService';
import type { TransactionDetailModel } from '@/types/transactionDetails';
import type { UnifiedActivityItem } from '@/types/unifiedActivity';
import type { RecoveredSwapTrace } from '@/utils/recoveredSwapTrace';

export function useTransactionDetailsDialog() {
  const address = useWalletStore((s) => s.address);
  const walletType = useWalletStore((s) => s.walletType);
  const journalRecords = useTransactionJournalStore((s) => s.records);
  const transferRecords = useSwapHistoryStore((s) => s.transferRecords);

  const [isOpen, setIsOpen] = useState(false);
  const [model, setModel] = useState<TransactionDetailModel | null>(null);
  const [flowModels, setFlowModels] = useState<TransactionDetailModel[] | undefined>();

  const close = useCallback(() => {
    setIsOpen(false);
    setModel(null);
    setFlowModels(undefined);
  }, []);

  const openModel = useCallback((detail: TransactionDetailModel | null, flow?: TransactionDetailModel[]) => {
    if (!detail) return;
    setModel(detail);
    setFlowModels(flow && flow.length > 1 ? flow : undefined);
    setIsOpen(true);
  }, []);

  const openFromActivityItem = useCallback(
    (item: UnifiedActivityItem) => {
      const detail = buildDetailFromUnifiedActivity(
        item,
        journalRecords,
        transferRecords,
        address,
      );
      if (!detail) return;

      if (item.source === 'journal' && item.flowId) {
        const flow = buildFlowDetailModels(item.flowId, journalRecords, address);
        if (flow.length > 1) {
          openModel(detail, flow);
          return;
        }
      }
      openModel(detail);
    },
    [address, journalRecords, openModel, transferRecords],
  );

  const openFromRecoveredTrace = useCallback(
    (trace: RecoveredSwapTrace) => {
      const detail = buildDetailFromRecoveredTrace(trace.activeRecordId, journalRecords, address);
      if (!detail) return;
      const flow = buildFlowDetailModels(trace.flowId, journalRecords, address);
      openModel(detail, flow.length > 1 ? flow : undefined);
    },
    [address, journalRecords, openModel],
  );

  const openFromJournalRecordId = useCallback(
    (recordId: string) => {
      const record = journalRecords.find((r) => r.id === recordId);
      if (!record) return;
      const detail = buildDetailFromJournalRecord(record, journalRecords, address);
      if (!detail) return;
      const flow = buildFlowDetailModels(record.flowId, journalRecords, address);
      openModel(detail, flow.length > 1 ? flow : undefined);
    },
    [address, journalRecords, openModel],
  );

  const dialog = useMemo(
    () => (
      <TransactionDetailsDialog
        isOpen={isOpen}
        onClose={close}
        model={model}
        flowModels={flowModels}
        walletProvider={walletType ?? undefined}
      />
    ),
    [close, flowModels, isOpen, model, walletType],
  );

  return {
    isOpen,
    model,
    openFromActivityItem,
    openFromRecoveredTrace,
    openFromJournalRecordId,
    close,
    dialog,
  };
}
