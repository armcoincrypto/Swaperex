/**
 * Alert Toast Component
 *
 * Shows temporary toast notifications for new alerts.
 * Auto-dismisses after a few seconds.
 *
 * Priority 12.1 - In-App Alerts
 */

import { useState, useEffect, useCallback } from 'react';
import { setToastCallback } from '@/hooks/useSignalAlerts';

interface Toast {
  id: string;
  title: string;
  body: string;
  level: string;
}

export function AlertToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Register toast callback
  const showToast = useCallback((alert: { title: string; body: string; level: string }) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newToast: Toast = { id, ...alert };

    setToasts((prev) => [...prev, newToast]);

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  // Register callback on mount
  useEffect(() => {
    setToastCallback(showToast);
    return () => setToastCallback(null);
  }, [showToast]);

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-sm">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`
            bg-dark-800 border rounded-lg shadow-lg p-3 animate-slide-in
            ${
              toast.level === 'high'
                ? 'border-red-700'
                : toast.level === 'medium'
                ? 'border-orange-700'
                : 'border-dark-600'
            }
          `}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-medium text-sm text-dark-100">{toast.title}</div>
              <div className="text-xs text-dark-400 mt-0.5">{toast.body}</div>
            </div>
            <button
              onClick={() => dismissToast(toast.id)}
              className="text-dark-500 hover:text-dark-300 text-sm"
            >
              ×
            </button>
          </div>
        </div>
      ))}

      {/* Animation styles */}
      <style>{`
        @keyframes slide-in {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        .animate-slide-in {
          animation: slide-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}

export default AlertToast;
