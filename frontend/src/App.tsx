/**
 * Main Application Component
 *
 * Routes and global layout.
 * SECURITY: All signing happens client-side via connected wallet.
 */

import { useState } from 'react';
import { WalletConnect } from '@/components/wallet/WalletConnect';
import { SwapInterface } from '@/components/swap/SwapInterface';
import { WithdrawalInterface } from '@/components/withdrawal/WithdrawalInterface';
import { TokenList } from '@/components/balances/TokenList';
import { ChainWarningBanner } from '@/components/chain/ChainWarning';
import { ToastContainer } from '@/components/common/Toast';
import { GlobalErrorDisplay } from '@/components/common/GlobalErrorDisplay';
import { NetworkSelector } from '@/components/common/NetworkSelector';
import { SwapHistory } from '@/components/history/SwapHistory';
import { TokenScreener } from '@/components/screener/TokenScreener';
import { AboutPage, TermsPage, PrivacyPage, DisclaimerPage } from '@/components/pages/StaticPages';
import { useWallet } from '@/hooks/useWallet';
import { useSwapStore } from '@/stores/swapStore';
import { useToastStore } from '@/stores/toastStore';
import { getTokenBySymbol } from '@/tokens';

type Page = 'swap' | 'send' | 'portfolio' | 'screener' | 'about' | 'terms' | 'privacy' | 'disclaimer';

export function App() {
  const [currentPage, setCurrentPage] = useState<Page>('swap');
  const { isConnected, isWrongChain, isReadOnly, chainId, switchNetwork } = useWallet();
  const { setFromAsset, setToAsset } = useSwapStore();
  const { toasts, removeToast } = useToastStore();
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

  // Handle swap selection from screener - prefill swap form
  const handleScreenerSwapSelect = async (fromSymbol: string, toSymbol: string, targetChainId: number) => {
    // Switch chain if needed
    if (chainId !== targetChainId) {
      try {
        await switchNetwork(targetChainId);
      } catch (err) {
        console.error('Failed to switch network:', err);
      }
    }

    // Get token info and prefill form
    const fromToken = getTokenBySymbol(fromSymbol, targetChainId);
    const toToken = getTokenBySymbol(toSymbol, targetChainId);

    if (fromToken) {
      setFromAsset({
        symbol: fromToken.symbol,
        name: fromToken.name,
        chain: targetChainId === 56 ? 'bsc' : 'ethereum',
        decimals: fromToken.decimals,
        is_native: fromSymbol === 'ETH' || fromSymbol === 'BNB',
        contract_address: fromToken.address,
        logo_url: fromToken.logoURI,
      });
    }

    if (toToken) {
      setToAsset({
        symbol: toToken.symbol,
        name: toToken.name,
        chain: targetChainId === 56 ? 'bsc' : 'ethereum',
        decimals: toToken.decimals,
        is_native: toSymbol === 'ETH' || toSymbol === 'BNB',
        contract_address: toToken.address,
        logo_url: toToken.logoURI,
      });
    }

    // Navigate to swap page
    setCurrentPage('swap');
  };

  // Handle swap from portfolio - prefill from token and go to swap
  const handlePortfolioSwap = (symbol: string) => {
    const token = getTokenBySymbol(symbol, chainId || 1);
    if (token) {
      setFromAsset({
        symbol: token.symbol,
        name: token.name,
        chain: chainId === 56 ? 'bsc' : 'ethereum',
        decimals: token.decimals,
        is_native: symbol === 'ETH' || symbol === 'BNB',
        contract_address: token.address,
        logo_url: token.logoURI,
      });
      // Set USDT as default "to" token
      const stablecoin = getTokenBySymbol('USDT', chainId || 1);
      if (stablecoin && stablecoin.symbol !== symbol) {
        setToAsset({
          symbol: stablecoin.symbol,
          name: stablecoin.name,
          chain: chainId === 56 ? 'bsc' : 'ethereum',
          decimals: stablecoin.decimals,
          is_native: false,
          contract_address: stablecoin.address,
          logo_url: stablecoin.logoURI,
        });
      }
    }
    setCurrentPage('swap');
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
                active={currentPage === 'send'}
                onClick={() => setCurrentPage('send')}
              >
                Send
              </NavButton>
              <NavButton
                active={currentPage === 'portfolio'}
                onClick={() => setCurrentPage('portfolio')}
              >
                Portfolio
              </NavButton>
              <NavButton
                active={currentPage === 'screener'}
                onClick={() => setCurrentPage('screener')}
              >
                Screener
              </NavButton>
            </nav>
          </div>

          {/* Network Selector and Wallet Connection */}
          <div className="flex items-center gap-3">
            <NetworkSelector />
            <WalletConnect />
          </div>
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

        {currentPage === 'send' && (
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Send Panel */}
            <div className="flex-1 flex justify-center">
              {isConnected ? (
                <WithdrawalInterface />
              ) : (
                <div className="w-full max-w-md mx-auto bg-dark-900 rounded-2xl p-8 border border-dark-800 text-center">
                  <h2 className="text-xl font-bold mb-4">Connect Your Wallet</h2>
                  <p className="text-dark-400 mb-6">
                    Connect your wallet to send tokens.
                  </p>
                  <WalletConnect />
                </div>
              )}
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
              <>
                <TokenList
                  onSwapToken={handlePortfolioSwap}
                  showSwapButtons={true}
                />
                <div className="mt-8">
                  <SwapHistory />
                </div>
              </>
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

        {currentPage === 'screener' && (
          <TokenScreener onSwapSelect={handleScreenerSwapSelect} />
        )}

        {/* Static Pages */}
        {currentPage === 'about' && <AboutPage onBack={() => setCurrentPage('swap')} />}
        {currentPage === 'terms' && <TermsPage onBack={() => setCurrentPage('swap')} />}
        {currentPage === 'privacy' && <PrivacyPage onBack={() => setCurrentPage('swap')} />}
        {currentPage === 'disclaimer' && <DisclaimerPage onBack={() => setCurrentPage('swap')} />}
      </main>

      {/* Footer */}
      <footer className="border-t border-dark-800 mt-auto">
        <div className="max-w-6xl mx-auto px-4 py-6 text-center text-sm text-dark-400">
          <p>Swaperex - Web3 Non-Custodial Swap Platform</p>
          <p className="mt-1">All transactions are signed locally in your wallet.</p>
          <div className="mt-3 flex justify-center gap-4">
            <button
              onClick={() => setCurrentPage('about')}
              className="hover:text-white transition-colors"
            >
              About
            </button>
            <button
              onClick={() => setCurrentPage('terms')}
              className="hover:text-white transition-colors"
            >
              Terms
            </button>
            <button
              onClick={() => setCurrentPage('privacy')}
              className="hover:text-white transition-colors"
            >
              Privacy
            </button>
            <button
              onClick={() => setCurrentPage('disclaimer')}
              className="hover:text-white transition-colors"
            >
              Disclaimer
            </button>
          </div>
        </div>
      </footer>

      {/* Global Error Display */}
      <GlobalErrorDisplay />

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
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
