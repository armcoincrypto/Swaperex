/**
 * Application Entry Point
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { initAppKit } from './services/wallet/appkit';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element not found');
}

// Must run before any subtree mounts AppKit hooks (AppKitBridge / useAppKit). Child useLayoutEffect
// runs after children render, so lazy WalletBootstrap cannot init AppKit inside useLayoutEffect alone.
initAppKit();

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);
