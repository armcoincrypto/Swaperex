/**
 * API Client for Swaperex Backend
 *
 * All requests go to the WEB_NON_CUSTODIAL endpoints.
 * No signing or broadcasting happens server-side.
 */

import axios, { AxiosInstance, AxiosError } from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function createClient(): AxiosInstance {
  const client = axios.create({
    baseURL: API_URL,
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // Request interceptor
  client.interceptors.request.use(
    (config) => {
      // Add any auth headers if needed
      return config;
    },
    (error) => Promise.reject(error)
  );

  // Response interceptor
  client.interceptors.response.use(
    (response) => response,
    (error: AxiosError) => {
      if (error.response) {
        const { status, data } = error.response;
        const message = (data as { detail?: string })?.detail || error.message;
        throw new ApiError(message, status, data);
      }
      throw new ApiError(error.message, 0);
    }
  );

  return client;
}

export const apiClient = createClient();

export default apiClient;
