/**
 * Wallet Scan Store
 *
 * Zustand store managing scan session state machine:
 *   idle → scanning → completed | failed
 *
 * Supports per-chain progress, cancellation, saved sessions,
 * and structured logging.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { scanChain } from './scanEngine';
import { ALL_SCAN_CHAINS } from './rpcConfig';
import { useWatchlistStore } from '@/stores/watchlistStore';
import { fetchEnrichment, applyEnrichment } from './enrichment';
import type {
  ScanChainName,
  ScanSession,
  ScanSessionStatus,
  ChainScanProgress,
  ScanLogEntry,
  ScanOptions,
  ScanDebugInfo,
  ScannedToken,
} from './types';
import { SCAN_CHAIN_IDS } from './types';

/** Max concurrent chain scans */
const MAX_CHAIN_CONCURRENCY = 2;

/** Max saved sessions */
const MAX_SAVED_SESSIONS = 5;

interface ScanStoreState {
  // Current session
  session: ScanSession | null;
  status: ScanSessionStatus;
  logs: ScanLogEntry[];

  // Saved sessions (persisted)
  savedSessions: Array<{
    id: string;
    walletAddress: string;
    timestamp: number;
    chainsScanned: ScanChainName[];
    totalFound: number;
    totalAdded: number;
  }>;

  // Abort controller ref
  _abortController: AbortController | null;

  // Actions
  startScan: (walletAddress: string, options?: ScanOptions) => Promise<void>;
  cancelScan: () => void;
  retryChain: (chain: ScanChainName) => Promise<void>;
  addTokenToWatchlist: (token: ScannedToken) => boolean;
  addAllToWatchlist: (tokens: ScannedToken[]) => number;
  resetSession: () => void;
  getDebugInfo: () => ScanDebugInfo | null;
  clearSavedSessions: () => void;
}

function generateSessionId(): string {
  return `scan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createEmptyChainProgress(chain: ScanChainName): ChainScanProgress {
  return {
    chainName: chain,
    chainId: SCAN_CHAIN_IDS[chain],
    status: 'pending',
    tokens: [],
    checked: 0,
    total: 0,
    elapsedMs: 0,
  };
}

export const useScanStore = create<ScanStoreState>()(
  persist(
    (set, get) => ({
      session: null,
      status: 'idle',
      logs: [],
      savedSessions: [],
      _abortController: null,

      startScan: async (walletAddress: string, options?: ScanOptions) => {
        const { status } = get();
        if (status === 'scanning') return;

        const chains = options?.chains || ALL_SCAN_CHAINS;
        const abortController = new AbortController();
        const signal = options?.signal
          ? combineAbortSignals(options.signal, abortController.signal)
          : abortController.signal;

        const sessionId = generateSessionId();
        const chainsRecord: Record<string, ChainScanProgress> = {};
        for (const chain of ALL_SCAN_CHAINS) {
          chainsRecord[chain] = createEmptyChainProgress(chain);
          if (!chains.includes(chain)) {
            chainsRecord[chain].status = 'completed';
          }
        }

        const session: ScanSession = {
          id: sessionId,
          status: 'scanning',
          walletAddress,
          startedAt: Date.now(),
          chains: chainsRecord as Record<ScanChainName, ChainScanProgress>,
          totalFound: 0,
          totalAdded: 0,
        };

        set({
          session,
          status: 'scanning',
          logs: [],
          _abortController: abortController,
        });

        const log = (entry: ScanLogEntry) => {
          set((s) => ({ logs: [...s.logs.slice(-99), entry] }));
        };

        log({ timestamp: Date.now(), level: 'info', message: `Scan started for ${walletAddress.slice(0, 8)}...` });

        // Scan chains with concurrency limit
        const chainQueue = [...chains];
        const running: Set<Promise<void>> = new Set();

        const scanNext = async () => {
          const chain = chainQueue.shift();
          if (!chain || signal.aborted) return;

          const onProgress = (progress: ChainScanProgress) => {
            set((s) => {
              if (!s.session) return {};
              const updatedChains = { ...s.session.chains, [chain]: progress };
              const totalFound = Object.values(updatedChains).reduce(
                (sum, c) => sum + c.tokens.length, 0,
              );
              return {
                session: { ...s.session, chains: updatedChains, totalFound },
              };
            });
          };

          const result = await scanChain(chain, walletAddress, onProgress, log, signal);
          onProgress(result);

          // Launch next chain if available
          if (chainQueue.length > 0 && !signal.aborted) {
            const next = scanNext();
            running.add(next);
            next.finally(() => running.delete(next));
          }
        };

        // Launch initial batch (up to MAX_CHAIN_CONCURRENCY)
        const initialBatch = Math.min(MAX_CHAIN_CONCURRENCY, chainQueue.length);
        for (let i = 0; i < initialBatch; i++) {
          const p = scanNext();
          running.add(p);
          p.finally(() => running.delete(p));
        }

        // Wait for all chains
        while (running.size > 0) {
          await Promise.race(running);
        }

        // Finalize session
        const finalState = get();
        if (!finalState.session) return;

        const allChains = Object.values(finalState.session.chains);
        const anyFailed = allChains.some((c) => c.status === 'failed');
        const allFailed = allChains.filter((c) => chains.includes(c.chainName)).every((c) => c.status === 'failed');
        const finalStatus: ScanSessionStatus = allFailed ? 'failed' : 'completed';

        const totalFound = allChains.reduce((sum, c) => sum + c.tokens.length, 0);

        set((s) => {
          if (!s.session) return {};
          const completedSession = {
            ...s.session,
            status: finalStatus,
            completedAt: Date.now(),
            totalFound,
          };

          // Save to history
          const savedEntry = {
            id: completedSession.id,
            walletAddress: completedSession.walletAddress,
            timestamp: completedSession.startedAt,
            chainsScanned: chains,
            totalFound,
            totalAdded: completedSession.totalAdded,
          };
          const savedSessions = [savedEntry, ...s.savedSessions].slice(0, MAX_SAVED_SESSIONS);

          return {
            session: completedSession,
            status: finalStatus,
            savedSessions,
            _abortController: null,
          };
        });

        const elapsed = Date.now() - session.startedAt;
        log({
          timestamp: Date.now(),
          level: anyFailed ? 'warn' : 'info',
          message: `Scan ${finalStatus}: ${totalFound} tokens found in ${elapsed}ms`,
        });

        // Optional: enrich with backend risk data (non-blocking)
        if (finalStatus === 'completed' && totalFound > 0) {
          const allTokens = allChains.flatMap((c) => c.tokens);
          fetchEnrichment(walletAddress, allTokens, chains).then((enrichment) => {
            if (!enrichment) return;
            log({ timestamp: Date.now(), level: 'info', message: `Risk data enriched for ${enrichment.tokens.length} tokens` });
            set((s) => {
              if (!s.session) return {};
              const updatedChains = { ...s.session.chains };
              for (const chainName of Object.keys(updatedChains) as ScanChainName[]) {
                const cp = updatedChains[chainName];
                updatedChains[chainName] = {
                  ...cp,
                  tokens: applyEnrichment(cp.tokens, enrichment),
                };
              }
              return { session: { ...s.session, chains: updatedChains } };
            });
          }).catch(() => {
            // Silently ignore enrichment failures
          });
        }
      },

      cancelScan: () => {
        const { _abortController } = get();
        if (_abortController) {
          _abortController.abort();
        }
        set((s) => ({
          status: s.session?.status === 'scanning' ? 'failed' : s.status,
          session: s.session ? { ...s.session, status: 'failed' as ScanSessionStatus } : null,
          _abortController: null,
        }));
      },

      retryChain: async (chain: ScanChainName) => {
        const { session } = get();
        if (!session) return;

        const abortController = new AbortController();
        set({ _abortController: abortController });

        const log = (entry: ScanLogEntry) => {
          set((s) => ({ logs: [...s.logs.slice(-99), entry] }));
        };

        const onProgress = (progress: ChainScanProgress) => {
          set((s) => {
            if (!s.session) return {};
            const updatedChains = { ...s.session.chains, [chain]: progress };
            const totalFound = Object.values(updatedChains).reduce(
              (sum, c) => sum + c.tokens.length, 0,
            );
            return {
              session: { ...s.session, chains: updatedChains, totalFound, status: 'scanning' },
              status: 'scanning',
            };
          });
        };

        log({ timestamp: Date.now(), level: 'info', chain, message: `Retrying ${chain}...` });

        const result = await scanChain(chain, session.walletAddress, onProgress, log, abortController.signal);
        onProgress(result);

        // Update overall status
        set((s) => {
          if (!s.session) return {};
          const allChains = Object.values(s.session.chains);
          const allDone = allChains.every((c) => c.status === 'completed' || c.status === 'failed');
          const anyFailed = allChains.some((c) => c.status === 'failed');
          const newStatus: ScanSessionStatus = allDone ? (anyFailed ? 'completed' : 'completed') : 'scanning';
          return {
            status: newStatus,
            session: { ...s.session, status: newStatus },
            _abortController: null,
          };
        });
      },

      addTokenToWatchlist: (token: ScannedToken) => {
        const store = useWatchlistStore.getState();

        if (token.isNative) return false;
        if (store.hasToken(token.chainId, token.address)) return false;

        const success = store.addToken({
          chainId: token.chainId,
          address: token.address,
          symbol: token.symbol,
          label: token.name,
        });

        if (success) {
          // Update token's isWatched flag in session
          set((s) => {
            if (!s.session) return {};
            const chains = { ...s.session.chains };
            const chainProgress = chains[token.chainName];
            if (chainProgress) {
              chains[token.chainName] = {
                ...chainProgress,
                tokens: chainProgress.tokens.map((t) =>
                  t.address === token.address ? { ...t, isWatched: true } : t,
                ),
              };
            }
            return {
              session: {
                ...s.session,
                chains,
                totalAdded: s.session.totalAdded + 1,
              },
            };
          });
        }
        return success;
      },

      addAllToWatchlist: (tokens: ScannedToken[]) => {
        let added = 0;
        const { addTokenToWatchlist } = get();
        for (const token of tokens) {
          if (token.isNative || token.isWatched) continue;
          if (addTokenToWatchlist(token)) added++;
        }
        return added;
      },

      resetSession: () => {
        const { _abortController } = get();
        if (_abortController) _abortController.abort();
        set({
          session: null,
          status: 'idle',
          logs: [],
          _abortController: null,
        });
      },

      getDebugInfo: (): ScanDebugInfo | null => {
        const { session } = get();
        if (!session) return null;

        return {
          sessionId: session.id,
          walletAddress: session.walletAddress,
          chains: Object.values(session.chains).map((c) => ({
            name: c.chainName,
            chainId: c.chainId,
            status: c.status,
            rpcUsed: c.rpcUsed || 'none',
            elapsedMs: c.elapsedMs,
            tokensFound: c.tokens.length,
            errorCode: c.errorCode,
            errorMessage: c.error,
          })),
          totalElapsedMs: session.completedAt
            ? session.completedAt - session.startedAt
            : Date.now() - session.startedAt,
          timestamp: new Date().toISOString(),
          userAgent: navigator.userAgent,
        };
      },

      clearSavedSessions: () => {
        set({ savedSessions: [] });
      },
    }),
    {
      name: 'swaperex-wallet-scan',
      version: 1,
      partialize: (state) => ({
        savedSessions: state.savedSessions,
      }),
    },
  ),
);

/** Combine two AbortSignals */
function combineAbortSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
  const controller = new AbortController();
  const abort = () => controller.abort();
  a.addEventListener('abort', abort, { once: true });
  b.addEventListener('abort', abort, { once: true });
  if (a.aborted || b.aborted) controller.abort();
  return controller.signal;
}

export default useScanStore;
