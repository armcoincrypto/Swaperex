/**
 * Application Entry Point
 *
 * Note on CSP "eval" warning:
 * The "Content Security Policy blocks eval" warning in console is expected.
 * Our codebase does NOT use eval(), new Function(), or string-based setTimeout/setInterval.
 * This warning comes from browser extensions (e.g., wallet injected scripts, TronLink).
 * Do NOT add 'unsafe-eval' to CSP - it would weaken security with no benefit.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { warnIfLocalhostInProduction } from './utils/apiConfig';

// Check for localhost API URLs in production (developer warning)
warnIfLocalhostInProduction();

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element not found');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);
