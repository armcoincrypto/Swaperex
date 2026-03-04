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

initAppKit();

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);
