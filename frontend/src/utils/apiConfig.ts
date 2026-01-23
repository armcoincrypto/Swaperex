/**
 * Centralized API Configuration
 *
 * Single source of truth for API base URLs.
 * Prevents localhost calls in production.
 */

/**
 * Check if we're in development mode
 */
export function isDevelopment(): boolean {
  return import.meta.env.DEV === true;
}

/**
 * Check if we're in production mode
 */
export function isProduction(): boolean {
  return import.meta.env.PROD === true;
}

/**
 * Get the main API base URL (backend-api on port 8000)
 *
 * Priority:
 * 1. VITE_API_URL env var (if set)
 * 2. In dev mode: localhost:8000
 * 3. In production: same-origin (relative URLs)
 */
export function getApiBaseUrl(): string {
  // Explicit env var takes priority
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  // Dev mode: use localhost
  if (isDevelopment()) {
    return 'http://localhost:8000';
  }

  // Production: use same-origin (browser will resolve relative to current host)
  // This means requests go to the same server serving the frontend
  return '';
}

/**
 * Get the signals API base URL (backend-signals on port 4001)
 *
 * Priority:
 * 1. VITE_SIGNALS_API_URL env var (if set)
 * 2. In dev mode: localhost:4001
 * 3. In production: production signals server
 */
export function getSignalsApiUrl(): string {
  // Explicit env var takes priority
  if (import.meta.env.VITE_SIGNALS_API_URL) {
    return import.meta.env.VITE_SIGNALS_API_URL;
  }

  // Dev mode: use localhost
  if (isDevelopment()) {
    return 'http://localhost:4001';
  }

  // Production: use the known production signals server
  return 'http://207.180.212.142:4001';
}

/**
 * Emit startup warning if API URLs resolve to localhost in production
 * Call this once at app startup (e.g., in main.tsx)
 */
export function warnIfLocalhostInProduction(): void {
  if (!isProduction()) {
    return;
  }

  const apiUrl = getApiBaseUrl();
  const signalsUrl = getSignalsApiUrl();

  if (apiUrl.includes('localhost') || apiUrl.includes('127.0.0.1')) {
    console.error(
      '[API CONFIG WARNING] Main API URL resolves to localhost in production!',
      '\nCurrent URL:', apiUrl,
      '\nSet VITE_API_URL environment variable to fix this.'
    );
  }

  if (signalsUrl.includes('localhost') || signalsUrl.includes('127.0.0.1')) {
    console.error(
      '[API CONFIG WARNING] Signals API URL resolves to localhost in production!',
      '\nCurrent URL:', signalsUrl,
      '\nSet VITE_SIGNALS_API_URL environment variable to fix this.'
    );
  }
}

// Log current config on module load (helpful for debugging)
if (typeof window !== 'undefined') {
  const mode = isDevelopment() ? 'development' : 'production';
  console.log(`[API Config] Mode: ${mode}`);
  console.log(`[API Config] Main API: ${getApiBaseUrl() || '(same-origin)'}`);
  console.log(`[API Config] Signals API: ${getSignalsApiUrl()}`);
}
