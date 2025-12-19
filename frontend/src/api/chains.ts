/**
 * Chain API - /chains endpoints
 */

import apiClient from './client';
import type { ChainInfo, ChainListResponse, AssetListResponse } from '@/types/api';

export async function getChains(): Promise<ChainListResponse> {
  const response = await apiClient.get<ChainListResponse>('/chains/');
  return response.data;
}

export async function getChain(chainId: string): Promise<ChainInfo> {
  const response = await apiClient.get<ChainInfo>(`/chains/${chainId}`);
  return response.data;
}

export async function getAssets(): Promise<AssetListResponse> {
  const response = await apiClient.get<AssetListResponse>('/chains/assets/');
  return response.data;
}

export const chainsApi = {
  getChains,
  getChain,
  getAssets,
};

export default chainsApi;
