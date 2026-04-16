/**
 * Lazy-loaded wallet host: AppKit store bridge + modal action registration.
 * createAppKit runs eagerly from main.tsx before React render so hooks here never race init.
 */

import { useEffect } from 'react';
import { useAppKit, useDisconnect } from '@reown/appkit/react';
import { AppKitBridge } from '@/components/wallet/AppKitBridge';
import {
  registerAppKitActions,
  unregisterAppKitActions,
  signalAppKitActionsReady,
} from '@/services/wallet/appKitActionsRegistry';

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

export default function WalletBootstrap() {
  return (
    <>
      <AppKitBridge />
      <AppKitActionsRegistrar />
    </>
  );
}
