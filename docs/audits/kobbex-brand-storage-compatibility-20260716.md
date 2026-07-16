# Kobbex Brand — Storage Compatibility (2026-07-16)

## Decision: keep all existing runtime keys

No storage keys were renamed. Renaming would erase existing users' local state.

Preserved keys (invisible to users):

- `swaperex-custom-tokens` (`tokens/index.ts`)
- `swaperex-dismissed-hints` (`components/common/OnboardingHint.tsx`)
- All Zustand `persist` keys `swaperex_*` across `stores/*` (transaction journal,
  swap history, terms acceptance, watchlist, portfolio, radar, screener, alerts,
  presets, favorites, usage, monitoring, custom tokens, send, signal history/filter,
  wallet scan).
- Custom DOM event names `swaperex:section`, `swaperex:navigate`.

## Preservation verification

- Existing local activity (transaction journal): key unchanged → readable.
- Terms acceptance (`termsStore`): key unchanged → readable.
- Watchlist (`watchlistStore`): key unchanged → readable.
- Preferences/presets: keys unchanged → readable.
- No wallet disconnection: AppKit persisted-state key + sanitizer unchanged.

Result: **existing user state fully preserved; zero migration required.**
