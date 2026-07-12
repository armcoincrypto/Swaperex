import { describe, it, expect } from 'vitest';
import {
  ADMIN_REVENUE_RECONCILIATION_LABEL,
  CLIENT_RECEIPT_RECONCILIATION_LABEL,
  OPERATOR_JOURNAL_STATUS_MATRIX,
  OBSERVABILITY_OWNERSHIP,
  adminHealthDomainLabel,
} from '@/utils/operatorObservabilityMapping';

describe('operatorObservabilityMapping', () => {
  it('distinguishes client receipt vs admin revenue reconciliation labels', () => {
    expect(CLIENT_RECEIPT_RECONCILIATION_LABEL).toContain('receipt');
    expect(ADMIN_REVENUE_RECONCILIATION_LABEL).toContain('Revenue');
    expect(adminHealthDomainLabel('reconciliation')).toBe(ADMIN_REVENUE_RECONCILIATION_LABEL);
  });

  it('maps all journal statuses in the operator matrix', () => {
    const statuses = OPERATOR_JOURNAL_STATUS_MATRIX.map((r) => r.journalStatus);
    expect(statuses).toEqual(['submitted', 'pending', 'confirmed', 'reverted', 'unknown', 'stale']);
    for (const row of OPERATOR_JOURNAL_STATUS_MATRIX) {
      expect(row.supportDiagnosticFields).toContain('correlationId');
    }
  });

  it('declares single ownership per observability concern', () => {
    expect(OBSERVABILITY_OWNERSHIP.correlationId).toContain('transactionCorrelation');
    expect(OBSERVABILITY_OWNERSHIP.receiptReconciliation).toContain('transactionReconciliation');
    expect(OBSERVABILITY_OWNERSHIP.adminRevenueReconciliation).toContain('reconciliation');
  });
});
