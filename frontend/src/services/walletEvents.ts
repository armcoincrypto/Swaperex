/**
 * Wallet Events Service
 *
 * PHASE 14: Centralized wallet event handling for production hardening.
 * Broadcasts wallet events (disconnect, chain change, account change)
 * so all active operations can safely cancel.
 *
 * SECURITY: Read-only event dispatch, no wallet access.
 */

export type WalletEventType =
  | 'disconnect'
  | 'chain_changed'
  | 'account_changed';

export interface WalletEvent {
  type: WalletEventType;
  timestamp: number;
  previousAddress?: string;
  newAddress?: string;
  previousChainId?: number;
  newChainId?: number;
}

type WalletEventListener = (event: WalletEvent) => void;

/**
 * Wallet event emitter
 */
class WalletEventEmitter {
  private listeners: Map<string, Set<WalletEventListener>> = new Map();
  private allListeners: Set<WalletEventListener> = new Set();

  /**
   * Subscribe to specific event type
   */
  on(type: WalletEventType, listener: WalletEventListener): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);

    // Return unsubscribe function
    return () => {
      this.listeners.get(type)?.delete(listener);
    };
  }

  /**
   * Subscribe to all events
   */
  onAny(listener: WalletEventListener): () => void {
    this.allListeners.add(listener);
    return () => {
      this.allListeners.delete(listener);
    };
  }

  /**
   * Emit event to all listeners
   */
  emit(type: WalletEventType, data: Omit<WalletEvent, 'type' | 'timestamp'>): void {
    const event: WalletEvent = {
      type,
      timestamp: Date.now(),
      ...data,
    };

    console.log(`[Wallet] Event: ${type}`, {
      timestamp: new Date(event.timestamp).toISOString(),
      ...data,
    });

    // Notify specific listeners
    this.listeners.get(type)?.forEach((listener) => {
      try {
        listener(event);
      } catch (err) {
        console.error(`[Wallet] Event listener error:`, err);
      }
    });

    // Notify all listeners
    this.allListeners.forEach((listener) => {
      try {
        listener(event);
      } catch (err) {
        console.error(`[Wallet] Event listener error:`, err);
      }
    });
  }

  /**
   * Remove all listeners
   */
  clear(): void {
    this.listeners.clear();
    this.allListeners.clear();
  }
}

// Singleton instance
export const walletEvents = new WalletEventEmitter();

/**
 * User-friendly messages for wallet events
 */
export function getWalletEventMessage(event: WalletEvent): string {
  switch (event.type) {
    case 'disconnect':
      return 'Wallet disconnected - operation cancelled safely';
    case 'chain_changed':
      return 'Network changed - operation cancelled safely';
    case 'account_changed':
      return 'Account changed - operation cancelled safely';
    default:
      return 'Wallet changed - operation cancelled safely';
  }
}

export default walletEvents;
