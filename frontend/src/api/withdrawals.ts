/**
 * Withdrawals API - /withdrawals endpoints
 *
 * Returns withdrawal transaction TEMPLATES only.
 * Backend execution is BLOCKED (403).
 */

import apiClient from './client';
import type {
  WithdrawalRequest,
  WithdrawalResponse,
  WithdrawalFeeEstimate,
} from '@/types/api';

export async function getWithdrawalTemplate(
  request: WithdrawalRequest
): Promise<WithdrawalResponse> {
  const response = await apiClient.post<WithdrawalResponse>('/withdrawals/template', request);
  return response.data;
}

export async function getFeeEstimate(
  asset: string,
  amount: string,
  chain?: string
): Promise<WithdrawalFeeEstimate> {
  const response = await apiClient.get<WithdrawalFeeEstimate>('/withdrawals/fee-estimate', {
    params: { asset, amount, chain },
  });
  return response.data;
}

// Note: /withdrawals/execute is BLOCKED with 403 in WEB mode
// All withdrawals must be signed and broadcast by the client

export const withdrawalsApi = {
  getWithdrawalTemplate,
  getFeeEstimate,
};

export default withdrawalsApi;
