/**
 * Quotes API - /quotes endpoints
 */

import apiClient from './client';
import type { QuoteRequest, QuoteResponse, MultiQuoteResponse } from '@/types/api';

export async function getQuote(request: QuoteRequest): Promise<QuoteResponse> {
  const response = await apiClient.post<QuoteResponse>('/quotes/', request);
  return response.data;
}

export async function getMultiQuote(request: QuoteRequest): Promise<MultiQuoteResponse> {
  const response = await apiClient.post<MultiQuoteResponse>('/quotes/multi', request);
  return response.data;
}

export async function getSupportedPairs(): Promise<{ pairs: Array<{ from: string; to: string }>; total: number }> {
  const response = await apiClient.get('/quotes/pairs');
  return response.data;
}

export const quotesApi = {
  getQuote,
  getMultiQuote,
  getSupportedPairs,
};

export default quotesApi;
