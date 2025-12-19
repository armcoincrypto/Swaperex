/**
 * Swaps API - /swaps endpoints
 *
 * Returns swap quotes with UNSIGNED transactions.
 * Client must sign and broadcast.
 */

import apiClient from './client';
import type { SwapQuoteRequest, SwapQuoteResponse } from '@/types/api';

export async function getSwapQuote(
  request: SwapQuoteRequest
): Promise<SwapQuoteResponse> {
  const response = await apiClient.post<SwapQuoteResponse>('/swaps/quote', request);
  return response.data;
}

export const swapsApi = {
  getSwapQuote,
};

export default swapsApi;
