/**
 * Static Pages Components
 *
 * Simple informational pages for legal and trust.
 * Non-custodial disclaimer clearly stated.
 */

interface StaticPageProps {
  onBack: () => void;
}

// About Page
export function AboutPage({ onBack }: StaticPageProps) {
  return (
    <StaticPageLayout title="About Swaperex" onBack={onBack}>
      <section className="mb-8">
        <h2 className="text-lg font-bold mb-3">What is Swaperex?</h2>
        <p className="text-dark-300 mb-4">
          Swaperex is a non-custodial decentralized exchange (DEX) aggregator that allows you to
          swap tokens directly from your wallet. We aggregate quotes from multiple DEXs including
          Uniswap, PancakeSwap, and 1inch to find you the best rates.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-bold mb-3">Non-Custodial</h2>
        <p className="text-dark-300 mb-4">
          Swaperex never has access to your private keys or funds. All transactions are signed
          directly in your wallet (like MetaMask). Your tokens remain in your wallet until you
          approve a transaction.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-bold mb-3">Supported Networks</h2>
        <ul className="list-disc list-inside text-dark-300 space-y-1">
          <li>Ethereum Mainnet</li>
          <li>BNB Chain (BSC)</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-bold mb-3">How It Works</h2>
        <ol className="list-decimal list-inside text-dark-300 space-y-2">
          <li>Connect your wallet (MetaMask)</li>
          <li>Select tokens to swap</li>
          <li>Enter amount and review quote</li>
          <li>Approve transaction in your wallet</li>
          <li>Transaction is executed on-chain</li>
        </ol>
      </section>
    </StaticPageLayout>
  );
}

// Terms of Use Page
export function TermsPage({ onBack }: StaticPageProps) {
  return (
    <StaticPageLayout title="Terms of Use" onBack={onBack}>
      <p className="text-dark-400 text-sm mb-6">Last updated: December 2024</p>

      <section className="mb-8">
        <h2 className="text-lg font-bold mb-3">1. Acceptance of Terms</h2>
        <p className="text-dark-300 mb-4">
          By using Swaperex, you agree to these terms. If you do not agree, do not use this service.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-bold mb-3">2. Service Description</h2>
        <p className="text-dark-300 mb-4">
          Swaperex provides a user interface for interacting with decentralized exchange protocols.
          We do not custody funds or execute trades on your behalf. You interact directly with
          blockchain smart contracts using your own wallet.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-bold mb-3">3. No Financial Advice</h2>
        <p className="text-dark-300 mb-4">
          Swaperex does not provide financial, investment, or trading advice. All trading decisions
          are your own responsibility. Cryptocurrency trading involves significant risk.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-bold mb-3">4. Risk Acknowledgment</h2>
        <p className="text-dark-300 mb-4">
          You acknowledge that:
        </p>
        <ul className="list-disc list-inside text-dark-300 space-y-1">
          <li>Cryptocurrency prices are highly volatile</li>
          <li>Smart contracts may contain bugs</li>
          <li>Transactions on blockchain are irreversible</li>
          <li>You are responsible for your own wallet security</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-bold mb-3">5. Limitation of Liability</h2>
        <p className="text-dark-300 mb-4">
          Swaperex is provided "as is" without warranties. We are not liable for any losses
          resulting from your use of this service, including but not limited to trading losses,
          failed transactions, or smart contract vulnerabilities.
        </p>
      </section>
    </StaticPageLayout>
  );
}

// Privacy Policy Page
export function PrivacyPage({ onBack }: StaticPageProps) {
  return (
    <StaticPageLayout title="Privacy Policy" onBack={onBack}>
      <p className="text-dark-400 text-sm mb-6">Last updated: December 2024</p>

      <section className="mb-8">
        <h2 className="text-lg font-bold mb-3">What We Collect</h2>
        <p className="text-dark-300 mb-4">
          Swaperex is a non-custodial application. We do not collect or store:
        </p>
        <ul className="list-disc list-inside text-dark-300 space-y-1">
          <li>Private keys</li>
          <li>Wallet passwords</li>
          <li>Personal identification information</li>
          <li>Email addresses or phone numbers</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-bold mb-3">Public Blockchain Data</h2>
        <p className="text-dark-300 mb-4">
          When you connect your wallet, we read your public wallet address and token balances
          from the blockchain. This information is publicly available on-chain.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-bold mb-3">Third-Party Services</h2>
        <p className="text-dark-300 mb-4">
          We use third-party services for:
        </p>
        <ul className="list-disc list-inside text-dark-300 space-y-1">
          <li>Quote aggregation (1inch, Uniswap, PancakeSwap)</li>
          <li>RPC providers for blockchain data</li>
          <li>Block explorers for transaction history</li>
        </ul>
        <p className="text-dark-300 mt-2">
          These services may have their own privacy policies.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-bold mb-3">Local Storage</h2>
        <p className="text-dark-300 mb-4">
          We may store preferences (like slippage settings) in your browser's local storage.
          This data never leaves your device.
        </p>
      </section>
    </StaticPageLayout>
  );
}

// Disclaimer Page
export function DisclaimerPage({ onBack }: StaticPageProps) {
  return (
    <StaticPageLayout title="Disclaimer" onBack={onBack}>
      <div className="bg-yellow-900/20 border border-yellow-800 rounded-xl p-4 mb-6">
        <p className="text-yellow-400 font-medium">
          Please read this disclaimer carefully before using Swaperex.
        </p>
      </div>

      <section className="mb-8">
        <h2 className="text-lg font-bold mb-3">Non-Custodial Service</h2>
        <p className="text-dark-300 mb-4">
          Swaperex is a non-custodial interface. We never have control over your funds.
          All transactions are executed directly by you through your own wallet.
          You are solely responsible for your wallet security and transaction decisions.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-bold mb-3">No Guarantees</h2>
        <p className="text-dark-300 mb-4">
          We do not guarantee:
        </p>
        <ul className="list-disc list-inside text-dark-300 space-y-1">
          <li>The accuracy of price quotes</li>
          <li>Successful execution of transactions</li>
          <li>Availability of the service</li>
          <li>That smart contracts are bug-free</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-bold mb-3">Your Responsibility</h2>
        <p className="text-dark-300 mb-4">
          By using Swaperex, you acknowledge that:
        </p>
        <ul className="list-disc list-inside text-dark-300 space-y-1">
          <li>You understand how cryptocurrency wallets work</li>
          <li>You understand the risks of decentralized finance</li>
          <li>You will verify all transaction details before signing</li>
          <li>You will not use this service for illegal activities</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-lg font-bold mb-3">Regulatory Notice</h2>
        <p className="text-dark-300 mb-4">
          Cryptocurrency regulations vary by jurisdiction. It is your responsibility to ensure
          that your use of this service complies with applicable laws in your location.
        </p>
      </section>
    </StaticPageLayout>
  );
}

// Shared Layout Component
function StaticPageLayout({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="max-w-2xl mx-auto">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-dark-400 hover:text-white mb-6 transition-colors"
      >
        <BackIcon />
        <span>Back</span>
      </button>

      <h1 className="text-2xl font-bold mb-6">{title}</h1>

      <div className="bg-dark-900 rounded-2xl p-6 border border-dark-800">
        {children}
      </div>
    </div>
  );
}

function BackIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  );
}

export default { AboutPage, TermsPage, PrivacyPage, DisclaimerPage };
