/**
 * Main Application Component
 *
 * Routes and global layout.
 * SECURITY: All signing happens client-side via connected wallet.
 */

import { useState } from 'react';
import { WalletConnect } from '@/components/wallet/WalletConnect';
import { SwapInterface } from '@/components/swap/SwapInterface';
import { TokenList } from '@/components/balances/TokenList';
import { ChainWarningBanner } from '@/components/chain/ChainWarning';
import { useWallet } from '@/hooks/useWallet';

type Page = 'swap' | 'portfolio';

export function App() {
  const [currentPage, setCurrentPage] = useState<Page>('swap');
  const { isConnected, isWrongChain, isReadOnly, chainId, switchNetwork } = useWallet();
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Handle chain switch from banner
  const handleBannerSwitch = async () => {
    try {
      await switchNetwork(1); // Switch to Ethereum mainnet
      setBannerDismissed(false);
    } catch (err) {
      console.error('Failed to switch network:', err);
    }
  };

  return (
    <div className="min-h-screen bg-dark-950">
      {/* Header */}
      <header className="border-b border-dark-800">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-8">
            {/* Logo */}
            <h1 className="text-xl font-bold text-primary-400">Swaperex</h1>

            {/* Navigation */}
            <nav className="flex gap-1">
              <NavButton
                active={currentPage === 'swap'}
                onClick={() => setCurrentPage('swap')}
              >
                Swap
              </NavButton>
              <NavButton
                active={currentPage === 'portfolio'}
                onClick={() => setCurrentPage('portfolio')}
              >
                Portfolio
              </NavButton>
            </nav>
          </div>

          {/* Wallet Connection */}
          <WalletConnect />
        </div>
      </header>

      {/* Chain Warning Banner */}
      {isConnected && isWrongChain && !isReadOnly && !bannerDismissed && (
        <ChainWarningBanner
          chainId={chainId}
          onSwitch={handleBannerSwitch}
          onDismiss={() => setBannerDismissed(true)}
        />
      )}

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        {currentPage === 'swap' && (
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Swap Panel */}
            <div className="flex-1 flex justify-center">
              <SwapInterface />
            </div>

            {/* Balances Sidebar */}
            {isConnected && (
              <aside className="w-full lg:w-80">
                <TokenList />
              </aside>
            )}
          </div>
        )}

        {currentPage === 'portfolio' && (
          <div className="max-w-2xl mx-auto">
            {isConnected ? (
              <TokenList />
            ) : (
              <div className="text-center py-16">
                <h2 className="text-2xl font-bold mb-4">Connect Your Wallet</h2>
                <p className="text-dark-400 mb-6">
                  Connect your wallet to view your portfolio and token balances.
                </p>
                <WalletConnect />
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-dark-800 mt-auto">
        <div className="max-w-6xl mx-auto px-4 py-6 text-center text-sm text-dark-400">
          <p>Swaperex - Web3 Non-Custodial Swap Platform</p>
          <p className="mt-1">All transactions are signed locally in your wallet.</p>
        </div>
      </footer>
    </div>
  );
}

function NavButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-lg font-medium transition-colors ${
        active
          ? 'bg-dark-800 text-white'
          : 'text-dark-400 hover:text-white hover:bg-dark-800/50'
      }`}
    >
      {children}
    </button>
  );
}

export default App;
