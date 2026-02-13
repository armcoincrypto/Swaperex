/**
 * Send Store Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useSendStore } from '@/stores/sendStore';

describe('sendStore', () => {
  beforeEach(() => {
    // Reset store state
    const store = useSendStore.getState();
    // Clear contacts and recent addresses
    store.contacts.forEach((c) => store.removeContact(c.address));
    useSendStore.setState({ recentAddresses: [], gasMode: 'auto' });
  });

  describe('contacts', () => {
    it('adds a contact', () => {
      const store = useSendStore.getState();
      store.addContact({
        name: 'Alice',
        address: '0x1234567890123456789012345678901234567890',
        chainId: 1,
      });

      const state = useSendStore.getState();
      expect(state.contacts).toHaveLength(1);
      expect(state.contacts[0].name).toBe('Alice');
    });

    it('prevents duplicate contacts by address', () => {
      const store = useSendStore.getState();
      const addr = '0x1234567890123456789012345678901234567890';

      store.addContact({ name: 'Alice', address: addr });
      store.addContact({ name: 'Alice Updated', address: addr });

      const state = useSendStore.getState();
      expect(state.contacts).toHaveLength(1);
      expect(state.contacts[0].name).toBe('Alice Updated');
    });

    it('removes a contact', () => {
      const store = useSendStore.getState();
      const addr = '0x1234567890123456789012345678901234567890';

      store.addContact({ name: 'Alice', address: addr });
      expect(useSendStore.getState().contacts).toHaveLength(1);

      store.removeContact(addr);
      expect(useSendStore.getState().contacts).toHaveLength(0);
    });

    it('removes contact case-insensitively', () => {
      const store = useSendStore.getState();
      store.addContact({
        name: 'Bob',
        address: '0xAbCdEf1234567890123456789012345678901234',
      });

      store.removeContact('0xabcdef1234567890123456789012345678901234');
      expect(useSendStore.getState().contacts).toHaveLength(0);
    });
  });

  describe('recent addresses', () => {
    it('adds recent address at the front', () => {
      const store = useSendStore.getState();
      store.addRecentAddress('0xaaaa');
      store.addRecentAddress('0xbbbb');

      const state = useSendStore.getState();
      expect(state.recentAddresses[0]).toBe('0xbbbb');
      expect(state.recentAddresses[1]).toBe('0xaaaa');
    });

    it('deduplicates recent addresses', () => {
      const store = useSendStore.getState();
      store.addRecentAddress('0xaaaa');
      store.addRecentAddress('0xbbbb');
      store.addRecentAddress('0xaaaa');

      const state = useSendStore.getState();
      expect(state.recentAddresses).toHaveLength(2);
      expect(state.recentAddresses[0]).toBe('0xaaaa'); // Moved to front
    });

    it('limits to MAX_RECENT (10)', () => {
      const store = useSendStore.getState();
      for (let i = 0; i < 15; i++) {
        store.addRecentAddress(`0x${i.toString().padStart(40, '0')}`);
      }

      expect(useSendStore.getState().recentAddresses).toHaveLength(10);
    });
  });

  describe('gas mode', () => {
    it('defaults to auto', () => {
      expect(useSendStore.getState().gasMode).toBe('auto');
    });

    it('updates gas mode', () => {
      useSendStore.getState().setGasMode('fast');
      expect(useSendStore.getState().gasMode).toBe('fast');
    });
  });
});
