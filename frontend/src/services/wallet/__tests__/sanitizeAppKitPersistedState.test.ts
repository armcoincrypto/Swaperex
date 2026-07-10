import { afterEach, describe, expect, it } from 'vitest';
import { sanitizeAppKitPersistedState } from '../sanitizeAppKitPersistedState';

const CONNECTED_KEY = '@appkit/eip155:connected_connector_id';

describe('sanitizeAppKitPersistedState', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('removes injected AppKit connector id', () => {
    localStorage.setItem(CONNECTED_KEY, 'io.metamask');
    localStorage.setItem('swaperex_last_connector', 'injected');
    sanitizeAppKitPersistedState();
    expect(localStorage.getItem(CONNECTED_KEY)).toBeNull();
    expect(localStorage.getItem('swaperex_last_connector')).toBeNull();
  });

  it('keeps walletConnect connector id', () => {
    localStorage.setItem(CONNECTED_KEY, 'walletConnect');
    sanitizeAppKitPersistedState();
    expect(localStorage.getItem(CONNECTED_KEY)).toBe('walletConnect');
  });
});
