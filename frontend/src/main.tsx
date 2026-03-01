/**
 * Application Entry Point
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { initWeb3Modal } from './services/wallet/web3modal';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element not found');
}

initWeb3Modal();

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);
