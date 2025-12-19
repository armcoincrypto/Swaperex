/**
 * API Client for Swaperex Backend
 *
 * All requests go to the WEB_NON_CUSTODIAL endpoints.
 * No signing or broadcasting happens server-side.
 */

import axios, { AxiosInstance, AxiosError } from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/**
 * Error types for better handling
 */
export type ApiErrorType =
  | 'network'
  | 'forbidden'
  | 'not_found'
  | 'validation'
  | 'server'
  | 'unknown';

export class ApiError extends Error {
  public type: ApiErrorType;

  constructor(
    message: string,
    public statusCode: number,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
    this.type = getErrorType(statusCode);
  }

  /**
   * Check if this is a blocked operation (403)
   */
  isBlockedOperation(): boolean {
    return this.statusCode === 403;
  }

  /**
   * Get user-friendly error message
   */
  getUserMessage(): string {
    switch (this.type) {
      case 'forbidden':
        return 'This operation is not allowed in web mode. Please sign transactions in your wallet.';
      case 'not_found':
        return 'The requested resource was not found.';
      case 'validation':
        return this.message || 'Invalid request. Please check your inputs.';
      case 'network':
        return 'Network error. Please check your connection and try again.';
      case 'server':
        return 'Server error. Please try again later.';
      default:
        return this.message || 'An unexpected error occurred.';
    }
  }
}

function getErrorType(statusCode: number): ApiErrorType {
  if (statusCode === 0) return 'network';
  if (statusCode === 403) return 'forbidden';
  if (statusCode === 404) return 'not_found';
  if (statusCode >= 400 && statusCode < 500) return 'validation';
  if (statusCode >= 500) return 'server';
  return 'unknown';
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
      // Log requests in development
      if (import.meta.env.DEV) {
        console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`);
      }
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

        // Extract error message from response
        let message = error.message;
        if (typeof data === 'object' && data !== null) {
          const errorData = data as Record<string, unknown>;
          message = (errorData.detail as string) ||
                    (errorData.message as string) ||
                    (errorData.error as string) ||
                    error.message;
        }

        // Log blocked operations
        if (status === 403) {
          console.warn(
            '[API] Blocked operation:',
            error.config?.url,
            data
          );
        }

        throw new ApiError(message, status, data);
      }

      // Network error (no response)
      throw new ApiError(
        error.message || 'Network error',
        0,
        { originalError: error.message }
      );
    }
  );

  return client;
}

export const apiClient = createClient();

/**
 * Helper to check if an error is an ApiError
 */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/**
 * Helper to check if an error is a blocked operation
 */
export function isBlockedOperation(error: unknown): boolean {
  return isApiError(error) && error.isBlockedOperation();
}

export default apiClient;
