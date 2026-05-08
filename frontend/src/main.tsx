/**
 * Application Entry Point
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { startMonitoringOutboxBridge } from './utils/productionMonitoring';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element not found');
}

startMonitoringOutboxBridge();

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);
