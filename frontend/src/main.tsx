/**
 * Application Entry Point
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
