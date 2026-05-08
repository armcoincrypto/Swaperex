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

export default function WalletBootstrap() {
  return (
    <>
      <AppKitBridge />
      <AppKitActionsRegistrar />
    </>
  );
}
