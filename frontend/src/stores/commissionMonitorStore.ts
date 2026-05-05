/**
 * Commission Monitor Store (local-only)
 *
 * Minimal read-only revenue tracking:
 * - Persists confirmed swap "commission evidence" to localStorage
 * - No backend / no PII (no wallet address stored)
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { NativeLane } from '@/utils/commission';

export type CommissionKind = 'wrapper' | '1inch_integrator_fee' | 'none';

export interface CommissionEvent {
  id: string;
  timestamp: number;
  txHash: string;
  chainId: number;
  provider: string;
  routeMode: string;
  txTo: string;
  commissionKind: CommissionKind;
  /** Derived from token pair at swap time (same semantics as classifyCommissionRoute). */
  nativeLane: NativeLane;
  expectedFeeBps: number | null;
  expectedRecipient: string | null;
}

interface CommissionMonitorState {
  events: CommissionEvent[];
  addConfirmedSwapEvent: (event: Omit<CommissionEvent, 'id'>) => void;
  clear: () => void;
}

const MAX_EVENTS = 200;

export const useCommissionMonitorStore = create<CommissionMonitorState>()(
  persist(
    (set) => ({
      events: [],

      addConfirmedSwapEvent: (event) => {
        set((state) => {
          const idx = state.events.findIndex((e) => e.txHash === event.txHash);
          const id = `${event.txHash}-${event.timestamp}`;
          if (idx >= 0) {
            const prev = state.events[idx];
            const merged: CommissionEvent = { ...prev, ...event, id: prev.id };
            const rest = state.events.filter((_, i) => i !== idx);
            return { events: [merged, ...rest].slice(0, MAX_EVENTS) };
          }
          return { events: [{ ...event, id }, ...state.events].slice(0, MAX_EVENTS) };
        });
      },

      clear: () => set({ events: [] }),
    }),
    {
      name: 'swaperex-commission-monitor',
      version: 2,
      partialize: (state) => ({ events: state.events }),
      migrate: (persisted, fromVersion) => {
        const p = persisted as { events?: CommissionEvent[] };
        const ev = p.events ?? [];
        if (fromVersion < 2) {
          return {
            events: ev.map((e) => ({
              ...e,
              nativeLane: (e as CommissionEvent).nativeLane ?? 'none',
            })),
          };
        }
        return { events: ev };
      },
    },
  ),
);
