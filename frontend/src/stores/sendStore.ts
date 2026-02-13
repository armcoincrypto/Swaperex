/**
 * Send Store (Zustand)
 *
 * Manages Send v2 form state, contacts, recent addresses.
 * Contacts and recent addresses persist to localStorage.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { GasMode } from '@/services/send/sendService';

export interface SavedContact {
  name: string;
  address: string;
  chainId?: number;
}

interface PersistedSendState {
  contacts: SavedContact[];
  recentAddresses: string[];
  gasMode: GasMode;
}

interface SendState extends PersistedSendState {
  // Actions
  addContact: (contact: SavedContact) => void;
  removeContact: (address: string) => void;
  addRecentAddress: (address: string) => void;
  setGasMode: (mode: GasMode) => void;
}

const MAX_RECENT = 10;

export const useSendStore = create<SendState>()(
  persist(
    (set) => ({
      contacts: [],
      recentAddresses: [],
      gasMode: 'auto',

      addContact: (contact) =>
        set((s) => {
          // Prevent duplicates by address
          const existing = s.contacts.filter(
            (c) => c.address.toLowerCase() !== contact.address.toLowerCase(),
          );
          return { contacts: [...existing, contact] };
        }),

      removeContact: (address) =>
        set((s) => ({
          contacts: s.contacts.filter(
            (c) => c.address.toLowerCase() !== address.toLowerCase(),
          ),
        })),

      addRecentAddress: (address) =>
        set((s) => {
          const lower = address.toLowerCase();
          const filtered = s.recentAddresses.filter(
            (a) => a.toLowerCase() !== lower,
          );
          return {
            recentAddresses: [address, ...filtered].slice(0, MAX_RECENT),
          };
        }),

      setGasMode: (gasMode) => set({ gasMode }),
    }),
    {
      name: 'swaperex-send',
      version: 1,
      partialize: (state) => ({
        contacts: state.contacts,
        recentAddresses: state.recentAddresses,
        gasMode: state.gasMode,
      }),
    },
  ),
);

export default useSendStore;
