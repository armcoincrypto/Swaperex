/**
 * Lazy-loaded wallet host: Reown AppKit init + store bridge + modal action registration.
 * Kept out of the main bundle so read-only / non-wallet first loads avoid vendor-reown-walletconnect.
 */

import { useEffect, useLayoutEffect } from 'react';
import { useAppKit, useDisconnect } from '@reown/appkit/react';
import { initAppKit } from '@/services/wallet/appkit';
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
  useLayoutEffect(() => {
    initAppKit();
  }, []);

  return (
    <>
      <AppKitBridge />
      <AppKitActionsRegistrar />
    </>
  );
}
