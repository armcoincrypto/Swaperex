/**
 * Terms / Privacy Acceptance Store
 *
 * Persists a single, local-only acceptance flag for the Swaperex Terms of Use
 * and Privacy Policy. Used to gate wallet connect and swap preview actions.
 *
 * SECURITY / PRIVACY:
 * - No personal data is collected.
 * - No network call. Acceptance lives entirely in the user's browser
 *   (`localStorage`) and is bumped via the version key when policies change.
 */

import { create } from 'zustand';

/** Bump when Terms / Privacy substantively change to require fresh acceptance. */
export const TERMS_VERSION = 1;

export const TERMS_ACCEPTED_STORAGE_KEY = 'swaperex_terms_accepted_v1';

interface PersistedAcceptance {
  version: number;
  acceptedAt: number;
}

interface TermsState {
  accepted: boolean;
  acceptedAt: number | null;
  version: number;
  accept: () => void;
  /** Test / admin only — clears local acceptance. Not wired to UI. */
  reset: () => void;
}

function readPersistedAcceptance(): PersistedAcceptance | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(TERMS_ACCEPTED_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedAcceptance>;
    if (
      typeof parsed?.version === 'number' &&
      typeof parsed?.acceptedAt === 'number' &&
      parsed.version === TERMS_VERSION
    ) {
      return { version: parsed.version, acceptedAt: parsed.acceptedAt };
    }
    return null;
  } catch {
    return null;
  }
}

function writePersistedAcceptance(record: PersistedAcceptance): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(TERMS_ACCEPTED_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Storage unavailable (private mode / quota) — gate will simply re-prompt next time.
  }
}

const initial = readPersistedAcceptance();

export const useTermsStore = create<TermsState>((set) => ({
  accepted: !!initial,
  acceptedAt: initial?.acceptedAt ?? null,
  version: TERMS_VERSION,

  accept: () => {
    const acceptedAt = Date.now();
    writePersistedAcceptance({ version: TERMS_VERSION, acceptedAt });
    set({ accepted: true, acceptedAt, version: TERMS_VERSION });
  },

  reset: () => {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(TERMS_ACCEPTED_STORAGE_KEY);
      } catch {
        // ignore
      }
    }
    set({ accepted: false, acceptedAt: null });
  },
}));

/** Imperative read for non-React callers (e.g. event handlers / services). */
export function isTermsAccepted(): boolean {
  return useTermsStore.getState().accepted;
}

export default useTermsStore;
