import { describe, it, expect } from 'vitest';
import {
  assertDiagnosticAllowlist,
  buildSupportDiagnosticBundle,
  renderSupportDiagnosticJson,
  renderSupportDiagnosticText,
} from '@/services/supportDiagnosticService';
import { buildDetailFromJournalRecord } from '@/services/transactionDetailService';
import type { ApprovalJournalRecord, SwapJournalRecord } from '@/types/transactionJournal';
import { JOURNAL_RECORD_SCHEMA_VERSION } from '@/types/transactionJournal';

const WALLET = '0x' + 'a'.repeat(40);
const HASH = '0x' + '1'.repeat(64);

function swapRecord(): SwapJournalRecord {
  return {
    schemaVersion: JOURNAL_RECORD_SCHEMA_VERSION,
    id: `1:swap:${HASH}`,
    flowId: 'flow-1',
    kind: 'swap',
    source: 'swaperex-client',
    walletAddress: WALLET,
    chainId: 1,
    transactionHash: HASH,
    status: 'pending',
    submittedAt: '2026-07-11T12:00:00.000Z',
    updatedAt: '2026-07-11T12:00:00.000Z',
    relatedRecordIds: [],
    context: {
      fromTokenAddress: 'native',
      fromTokenSymbol: 'ETH',
      fromTokenDecimals: 18,
      toTokenAddress: '0x' + '2'.repeat(40),
      toTokenSymbol: 'USDC',
      toTokenDecimals: 6,
      inputAmountRaw: '1',
      inputAmountDisplay: '1',
      expectedOutputDisplay: '2000',
      slippageBps: 50,
      provider: 'uniswap-v3',
    },
    reconciliation: {
      attempts: 2,
      lastProviderErrorCategory: 'timeout',
      lastProviderError: 'provider timeout',
    },
    error: {
      category: 'rpc_error',
      stage: 'swap-confirm',
      technicalSummary: 'x'.repeat(800),
      occurredAt: '2026-07-11T12:01:00.000Z',
      broadcastKnown: true,
      retryable: true,
    },
  };
}

describe('supportDiagnosticService', () => {
  it('includes correlation and reconciliation fields', () => {
    const detail = buildDetailFromJournalRecord(swapRecord(), [swapRecord()], WALLET)!;
    const bundle = buildSupportDiagnosticBundle(detail);
    expect(bundle.correlationId).toBe('flow-1');
    expect(bundle.flowId).toBe('flow-1');
    expect(bundle.journalStatus).toBe('pending');
    expect(bundle.reconciliationAttempts).toBe(2);
    expect(bundle.reconciliationState).toBe('timeout');
    const text = renderSupportDiagnosticText(bundle);
    expect(text).toContain('Correlation: flow-1');
    expect(text).toContain('Journal status:');
    expect(text).toContain('Reconciliation:');
  });

  it('masks wallet in diagnostic bundle', () => {
    const detail = buildDetailFromJournalRecord(swapRecord(), [swapRecord()], WALLET)!;
    const bundle = buildSupportDiagnosticBundle(detail);
    expect(bundle.walletAddressMasked).toMatch(/^0x/);
    expect(bundle.walletAddressMasked).not.toBe(WALLET);
    expect(JSON.stringify(bundle)).not.toContain(WALLET);
  });

  it('excludes sensitive adversarial keys via allowlist', () => {
    const detail = buildDetailFromJournalRecord(swapRecord(), [swapRecord()], WALLET)!;
    const polluted = {
      ...buildSupportDiagnosticBundle(detail),
      privateKey: '0xdead',
      seedPhrase: 'abandon abandon',
      signature: '0xsig',
      walletConnectTopic: 'topic-123',
      rpcUrl: 'https://secret-rpc',
      stack: 'Error: secret',
    } as Record<string, unknown>;

    const safe = assertDiagnosticAllowlist(polluted as ReturnType<typeof buildSupportDiagnosticBundle>);
    expect((safe as Record<string, unknown>).privateKey).toBeUndefined();
    expect((safe as Record<string, unknown>).seedPhrase).toBeUndefined();
    expect((safe as Record<string, unknown>).signature).toBeUndefined();
    expect((safe as Record<string, unknown>).walletConnectTopic).toBeUndefined();
  });

  it('bounds technical error exposure through detail model', () => {
    const detail = buildDetailFromJournalRecord(swapRecord(), [swapRecord()], WALLET)!;
    const bundle = buildSupportDiagnosticBundle(detail);
    expect(bundle.errorCategory).toBe('rpc_error');
    expect(renderSupportDiagnosticText(bundle)).not.toContain('x'.repeat(800));
  });

  it('renders readable support text without nullish artifacts', () => {
    const detail = buildDetailFromJournalRecord(swapRecord(), [swapRecord()], WALLET)!;
    const text = renderSupportDiagnosticText(buildSupportDiagnosticBundle(detail));
    expect(text).toContain('Kobbex transaction diagnostic');
    expect(text).not.toMatch(/undefined|null|\[object Object\]/i);
    expect(text).toContain(HASH);
  });

  it('renders machine-readable JSON from same bundle', () => {
    const detail = buildDetailFromJournalRecord(swapRecord(), [swapRecord()], WALLET)!;
    const json = renderSupportDiagnosticJson(buildSupportDiagnosticBundle(detail));
    const parsed = JSON.parse(json);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.transactionHash).toBe(HASH);
  });

  it('includes approval hash for linked flow', () => {
    const approval: ApprovalJournalRecord = {
      ...swapRecord(),
      id: '1:approval:0x' + '3'.repeat(64),
      kind: 'approval',
      transactionHash: '0x' + '3'.repeat(64),
      status: 'confirmed',
      context: {
        tokenAddress: '0x' + '4'.repeat(40),
        tokenSymbol: 'USDT',
        tokenDecimals: 6,
        spenderAddress: '0x' + '5'.repeat(40),
        approvalMode: 'exact',
        provider: 'uniswap-v3',
      },
    };
    const swap = swapRecord();
    const detail = buildDetailFromJournalRecord(swap, [approval, swap], WALLET)!;
    detail.relatedTransactions = [
      {
        kind: 'approval',
        status: 'confirmed',
        transactionHash: approval.transactionHash,
        label: 'Token approval',
      },
    ];
    const bundle = buildSupportDiagnosticBundle(detail);
    expect(bundle.approvalHash).toBe(approval.transactionHash);
  });
});
