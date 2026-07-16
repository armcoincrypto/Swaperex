/**
 * Terms / Privacy Acceptance Gate
 *
 * Reusable modal that blocks an action (e.g. Connect Wallet, Preview Swap) until
 * the user explicitly confirms they have read and accept the Terms of Use and
 * Privacy Policy. Acceptance is stored locally via `useTermsStore`.
 *
 * Behavior:
 * - Checkbox is required. The primary action button is disabled until checked.
 * - Terms / Privacy links route within the SPA via the `swaperex:navigate`
 *   custom event handled in `App.tsx` (no router dependency).
 * - This modal does NOT trigger wallet connect or swap by itself — it returns
 *   control to the caller through `onAccept`. The caller decides what to do
 *   next (open wallet picker, run preview, etc.).
 */

import { useEffect, useId, useState } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { useTermsStore } from '@/stores/termsStore';

interface TermsGateModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after the user checks the box and clicks the primary action. */
  onAccept: () => void;
  /** Optional override for the primary action label (default: "Accept & Continue"). */
  actionLabel?: string;
  /** Optional override for the modal title (default: "Before you continue"). */
  title?: string;
}

function emitNavigate(page: 'terms' | 'privacy'): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('swaperex:navigate', { detail: { page } }),
  );
}

export function TermsGateModal({
  isOpen,
  onClose,
  onAccept,
  actionLabel = 'Accept & Continue',
  title = 'Before you continue',
}: TermsGateModalProps) {
  const accept = useTermsStore((s) => s.accept);
  const [checked, setChecked] = useState(false);
  const checkboxId = useId();

  // Reset transient checkbox state whenever the gate is re-opened.
  useEffect(() => {
    if (isOpen) setChecked(false);
  }, [isOpen]);

  const handleAccept = () => {
    if (!checked) return;
    accept();
    onAccept();
  };

  const handleNavigate = (page: 'terms' | 'privacy') => {
    emitNavigate(page);
    onClose();
  };

  const footer = (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button onClick={onClose} variant="ghost" size="md">
        Cancel
      </Button>
      <Button
        onClick={handleAccept}
        variant="primary"
        size="md"
        disabled={!checked}
      >
        {actionLabel}
      </Button>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="md" footer={footer}>
      <div className="space-y-4 text-sm leading-relaxed text-dark-200">
        <p className="text-[13px] text-dark-300">
          Kobbex is a non-custodial DEX interface. You keep control of your wallet
          and sign transactions yourself. Crypto swaps are final on-chain and may
          involve price movement, slippage, network fees, and smart-contract risk.
        </p>

        <label
          htmlFor={checkboxId}
          className="flex items-start gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-3 cursor-pointer hover:border-white/[0.14] transition-colors"
        >
          <input
            id={checkboxId}
            name={checkboxId}
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-dark-600 bg-dark-800 text-primary-500 focus:ring-primary-500"
          />
          <span className="text-[13px] text-dark-100">
            I confirm that I am at least 18 years old and I have read and accept the{' '}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleNavigate('terms');
              }}
              className="underline text-primary-300 hover:text-primary-200"
            >
              Terms of Use
            </button>{' '}
            and{' '}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleNavigate('privacy');
              }}
              className="underline text-primary-300 hover:text-primary-200"
            >
              Privacy Policy
            </button>
            .
          </span>
        </label>

        <p className="text-[11px] text-dark-500 leading-snug">
          Your acceptance is recorded only in your browser. We do not collect personal
          data for this confirmation.
        </p>
      </div>
    </Modal>
  );
}

export default TermsGateModal;
