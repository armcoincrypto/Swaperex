/**
 * React hook for wallet-scoped transaction reconciliation and recovery trace.
 */

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useWallet } from '@/hooks/useWallet';
import { useTransactionJournalStore } from '@/stores/transactionJournalStore';
import {
  getRecoveredTraceForWallet,
  type RecoveredSwapTrace,
} from '@/utils/recoveredSwapTrace';
import { transactionReconciliationCoordinator } from '@/services/transactionReconciliationCoordinator';

export function useTransactionReconciliation(): {
  recoveredTrace: RecoveredSwapTrace | null;
  isReconciling: boolean;
  manualRecheck: () => Promise<void>;
  manualRecheckDisabled: boolean;
} {
  const { address, isConnected } = useWallet();
  const hydrationComplete = useTransactionJournalStore((s) => s.hydrationComplete);
  const records = useTransactionJournalStore((s) => s.records);

  const reconcilingIds = useSyncExternalStore(
    (onStoreChange) => transactionReconciliationCoordinator.subscribe(onStoreChange),
    () => transactionReconciliationCoordinator.getReconcilingRecordIds(),
    () => new Set<string>(),
  );

  const [manualBusy, setManualBusy] = useState(false);
  const [manualCooldown, setManualCooldown] = useState(false);

  useEffect(() => {
    transactionReconciliationCoordinator.start();
  }, []);

  useEffect(() => {
    if (!hydrationComplete) return;
    transactionReconciliationCoordinator.setWalletAddress(isConnected ? address : null);
    if (isConnected && address) {
      void transactionReconciliationCoordinator.reconcileWallet(address, 'app-mount');
    }
  }, [address, isConnected, hydrationComplete]);

  const recoveredTrace = useMemo(() => {
    if (!isConnected || !address) return null;
    return getRecoveredTraceForWallet(records, address, reconcilingIds);
  }, [records, address, isConnected, reconcilingIds]);

  const manualRecheck = useCallback(async () => {
    if (!recoveredTrace) return;
    setManualBusy(true);
    try {
      const ok = await transactionReconciliationCoordinator.manualRecheck(recoveredTrace.activeRecordId);
      if (ok) {
        setManualCooldown(true);
        window.setTimeout(() => setManualCooldown(false), 4000);
      }
    } finally {
      setManualBusy(false);
    }
  }, [recoveredTrace]);

  return {
    recoveredTrace,
    isReconciling: manualBusy || Boolean(recoveredTrace?.isReconciling),
    manualRecheck,
    manualRecheckDisabled: manualBusy || manualCooldown,
  };
}
