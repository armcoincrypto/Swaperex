/**
 * Lazy-loaded wallet host: AppKit store bridge + modal action registration.
 * initAppKit runs at module load (before any component render) so useAppKit* hooks never race init.
 */

import { useEffect } from 'react';
import { useAppKit, useDisconnect } from '@reown/appkit/react';
import { AppKitBridge } from '@/components/wallet/AppKitBridge';
import { initAppKit } from '@/services/wallet/appkit';
import {
  registerAppKitActions,
  unregisterAppKitActions,
  signalAppKitActionsReady,
} from '@/services/wallet/appKitActionsRegistry';

initAppKit();

function AppKitActionsRegistrar() {
  const { open } = useAppKit();
  const { disconnect } = useDisconnect();

  useEffect(() => {
    registerAppKitActions(open, disconnect);
    signalAppKitActionsReady();
    return () => unregisterAppKitActions();
  }, [open, disconnect]);

  return null;
}

/**
 * Recovers from Reown router goBack() leaving ConnectingExternal view without connector data
 * (vendor edge case when enableInjected is false and modal history is stale).
 */
function AppKitModalErrorGuard() {
  const { close } = useAppKit();

  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      const message = event.message ?? '';
      if (!message.includes('w3m-connecting-view: No connector provided')) {
        return;
      }
      event.preventDefault();
      try {
        close();
      } catch {
        /* modal may already be closed */
      }
      console.warn(
        '[WalletBootstrap] Closed AppKit modal after stale connecting-view error (injected connector state cleared).',
      );
    };
    window.addEventListener('error', onError);
    return () => window.removeEventListener('error', onError);
  }, [close]);

  return null;
}

export default function WalletBootstrap() {
  return (
    <>
      <AppKitBridge />
      <AppKitActionsRegistrar />
      <AppKitModalErrorGuard />
    </>
  );
}
