/**
 * Modal Component
 *
 * Layout contract:
 * - Modal box is capped to the visible viewport (`100dvh - margin`) so it never
 *   exceeds the screen at common zoom levels.
 * - Content scrolls inside the body region; the page behind the backdrop does
 *   not scroll while the modal is open (overscroll-contain).
 * - Optional `footer` slot stays visible at the bottom even when the body
 *   scrolls — use this for primary actions (Confirm, Approve & Swap, etc.)
 *   so they remain reachable on short viewports.
 */

import { Fragment, ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /**
   * Optional sticky footer rendered below the scrollable body. Use for primary
   * actions so they remain visible regardless of body length.
   */
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const sizeStyles = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
};

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = 'md',
}: ModalProps) {
  if (!isOpen) return null;

  const modalContent = (
    <Fragment>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div
          className={`w-full ${sizeStyles[size]} bg-dark-900 rounded-2xl border border-dark-800 shadow-xl flex flex-col max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-4rem)] overflow-hidden`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          {title && (
            <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-dark-800">
              <h3 className="text-lg font-semibold">{title}</h3>
              <button
                onClick={onClose}
                className="p-1 rounded-lg text-dark-400 hover:text-white hover:bg-dark-800 transition-colors"
                aria-label="Close"
              >
                <CloseIcon />
              </button>
            </div>
          )}

          {/* Body — scrolls when content exceeds viewport */}
          <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-6">
            {children}
          </div>

          {/* Sticky footer — kept visible while body scrolls */}
          {footer && (
            <div className="shrink-0 border-t border-dark-800 bg-dark-900/95 backdrop-blur-sm px-6 py-4">
              {footer}
            </div>
          )}
        </div>
      </div>
    </Fragment>
  );

  return createPortal(modalContent, document.body);
}

function CloseIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  );
}

export default Modal;
