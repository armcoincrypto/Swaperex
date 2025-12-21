/**
 * Global Error Store
 *
 * PHASE 14: Centralized error management for production hardening.
 * Collects errors from all async flows and surfaces them in one place.
 *
 * SECURITY: Read-only error display, no sensitive data exposure.
 */

import { create } from 'zustand';

/**
 * Error categories matching portfolioErrorHandler
 */
export type ErrorCategory =
  | 'user_rejected'
  | 'insufficient_balance'
  | 'network_error'
  | 'rpc_timeout'
  | 'rate_limit'
  | 'quote_expired'
  | 'slippage_error'
  | 'chain_mismatch'
  | 'unsupported_chain'
  | 'contract_error'
  | 'gas_error'
  | 'invalid_address'
  | 'no_wallet'
  | 'unknown';

/**
 * Error source - which module produced the error
 */
export type ErrorSource =
  | 'swap'
  | 'quote'
  | 'approval'
  | 'portfolio'
  | 'txHistory'
  | 'wallet'
  | 'network'
  | 'unknown';

/**
 * Global error structure
 */
export interface GlobalError {
  id: string;
  category: ErrorCategory;
  source: ErrorSource;
  message: string;           // User-friendly short message
  details?: string;          // Technical details (expandable)
  retryable: boolean;
  retryAction?: () => void;  // Optional retry function
  timestamp: number;
  dismissed: boolean;
}

/**
 * Error store state
 */
interface ErrorState {
  errors: GlobalError[];
  activeError: GlobalError | null;  // Currently displayed error

  // Actions
  addError: (error: Omit<GlobalError, 'id' | 'timestamp' | 'dismissed'>) => string;
  dismissError: (id: string) => void;
  dismissAll: () => void;
  retryError: (id: string) => void;
  clearError: (id: string) => void;
  clearAllErrors: () => void;
  setActiveError: (error: GlobalError | null) => void;
}

/**
 * Map category to user-friendly message
 */
export function getCategoryMessage(category: ErrorCategory): string {
  const messages: Record<ErrorCategory, string> = {
    user_rejected: 'Transaction cancelled',
    insufficient_balance: 'Insufficient balance',
    network_error: 'Network connection error',
    rpc_timeout: 'Request timed out',
    rate_limit: 'Too many requests',
    quote_expired: 'Quote expired',
    slippage_error: 'Price moved too much',
    chain_mismatch: 'Wrong network',
    unsupported_chain: 'Chain not supported',
    contract_error: 'Transaction failed',
    gas_error: 'Gas estimation failed',
    invalid_address: 'Invalid address',
    no_wallet: 'Wallet not connected',
    unknown: 'Something went wrong',
  };
  return messages[category] || 'An error occurred';
}

/**
 * Check if error category is recoverable (show retry)
 */
export function isRecoverable(category: ErrorCategory): boolean {
  const recoverableCategories: ErrorCategory[] = [
    'network_error',
    'rpc_timeout',
    'rate_limit',
    'quote_expired',
  ];
  return recoverableCategories.includes(category);
}

/**
 * Global error store
 */
export const useErrorStore = create<ErrorState>((set, get) => ({
  errors: [],
  activeError: null,

  addError: (error) => {
    const id = `err-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const timestamp = Date.now();

    const newError: GlobalError = {
      ...error,
      id,
      timestamp,
      dismissed: false,
    };

    console.log(`[GlobalError] ${error.source}:${error.category} | ${error.message}`, {
      details: error.details,
      retryable: error.retryable,
    });

    set((state) => ({
      errors: [newError, ...state.errors].slice(0, 50), // Keep last 50 errors
      activeError: newError, // Auto-show new error
    }));

    return id;
  },

  dismissError: (id) => {
    set((state) => ({
      errors: state.errors.map((e) =>
        e.id === id ? { ...e, dismissed: true } : e
      ),
      activeError: state.activeError?.id === id ? null : state.activeError,
    }));
  },

  dismissAll: () => {
    set((state) => ({
      errors: state.errors.map((e) => ({ ...e, dismissed: true })),
      activeError: null,
    }));
  },

  retryError: (id) => {
    const error = get().errors.find((e) => e.id === id);
    if (error?.retryAction) {
      console.log(`[GlobalError] Retrying ${error.source}:${error.category}`);
      get().dismissError(id);
      error.retryAction();
    }
  },

  clearError: (id) => {
    set((state) => ({
      errors: state.errors.filter((e) => e.id !== id),
      activeError: state.activeError?.id === id ? null : state.activeError,
    }));
  },

  clearAllErrors: () => {
    set({ errors: [], activeError: null });
  },

  setActiveError: (error) => {
    set({ activeError: error });
  },
}));

/**
 * Convenience functions for adding errors
 */
export const globalError = {
  swap: (category: ErrorCategory, message: string, details?: string, retryAction?: () => void) =>
    useErrorStore.getState().addError({
      category,
      source: 'swap',
      message,
      details,
      retryable: isRecoverable(category) || !!retryAction,
      retryAction,
    }),

  quote: (category: ErrorCategory, message: string, details?: string, retryAction?: () => void) =>
    useErrorStore.getState().addError({
      category,
      source: 'quote',
      message,
      details,
      retryable: isRecoverable(category) || !!retryAction,
      retryAction,
    }),

  portfolio: (category: ErrorCategory, message: string, details?: string, retryAction?: () => void) =>
    useErrorStore.getState().addError({
      category,
      source: 'portfolio',
      message,
      details,
      retryable: isRecoverable(category) || !!retryAction,
      retryAction,
    }),

  txHistory: (category: ErrorCategory, message: string, details?: string, retryAction?: () => void) =>
    useErrorStore.getState().addError({
      category,
      source: 'txHistory',
      message,
      details,
      retryable: isRecoverable(category) || !!retryAction,
      retryAction,
    }),

  wallet: (category: ErrorCategory, message: string, details?: string, retryAction?: () => void) =>
    useErrorStore.getState().addError({
      category,
      source: 'wallet',
      message,
      details,
      retryable: isRecoverable(category) || !!retryAction,
      retryAction,
    }),

  network: (category: ErrorCategory, message: string, details?: string, retryAction?: () => void) =>
    useErrorStore.getState().addError({
      category,
      source: 'network',
      message,
      details,
      retryable: isRecoverable(category) || !!retryAction,
      retryAction,
    }),
};

export default useErrorStore;
