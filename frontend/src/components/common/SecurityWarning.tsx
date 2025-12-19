/**
 * Security Warning Component
 *
 * Displays warnings for security-sensitive actions.
 * Used to block forbidden actions and warn users.
 */

type ForbiddenAction = 'private_key' | 'seed_phrase' | 'server_signing' | 'auto_sign';

interface SecurityWarningProps {
  type: ForbiddenAction;
}

const warningMessages: Record<ForbiddenAction, { title: string; message: string }> = {
  private_key: {
    title: 'Never Enter Your Private Key',
    message:
      'We will NEVER ask for your private key. Anyone asking for it is trying to steal your funds. All signing happens in your wallet.',
  },
  seed_phrase: {
    title: 'Never Enter Your Seed Phrase',
    message:
      'We will NEVER ask for your seed phrase (recovery words). This is a scam attempt. Keep your seed phrase secret and offline.',
  },
  server_signing: {
    title: 'Server Signing Not Allowed',
    message:
      'All transactions must be signed in your wallet. We never sign transactions on our servers. This protects your funds.',
  },
  auto_sign: {
    title: 'Automatic Signing Disabled',
    message:
      'All transactions require your explicit approval in your wallet. We never auto-sign or batch transactions without consent.',
  },
};

export function SecurityWarning({ type }: SecurityWarningProps) {
  const config = warningMessages[type];

  return (
    <div className="bg-red-900/30 border-2 border-red-600 rounded-xl p-4">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          <ShieldAlertIcon />
        </div>
        <div>
          <h4 className="font-bold text-red-400">{config.title}</h4>
          <p className="mt-1 text-sm text-dark-200">{config.message}</p>
        </div>
      </div>
    </div>
  );
}

/**
 * Detect if input looks like a private key or seed phrase
 */
export function detectSensitiveInput(value: string): 'private_key' | 'seed_phrase' | null {
  // Trim and normalize
  const normalized = value.trim().toLowerCase();

  // Check for hex private key (64 hex chars, optionally with 0x prefix)
  if (/^(0x)?[a-f0-9]{64}$/i.test(normalized)) {
    return 'private_key';
  }

  // Check for mnemonic phrase (12-24 words)
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length >= 12 && words.length <= 24) {
    // Check if words look like BIP39 (all lowercase letters)
    const looksLikeMnemonic = words.every((word) => /^[a-z]+$/.test(word));
    if (looksLikeMnemonic) {
      return 'seed_phrase';
    }
  }

  return null;
}

/**
 * Input guard that blocks sensitive data entry
 */
export function useSensitiveInputGuard() {
  const checkInput = (value: string): { blocked: boolean; type: ForbiddenAction | null } => {
    const sensitiveType = detectSensitiveInput(value);
    if (sensitiveType) {
      return { blocked: true, type: sensitiveType };
    }
    return { blocked: false, type: null };
  };

  return { checkInput };
}

/**
 * Approval amount warning
 */
export function ApprovalWarning({
  amount,
  tokenSymbol,
  spenderAddress,
}: {
  amount: string;
  tokenSymbol: string;
  spenderAddress: string;
}) {
  // Check if unlimited approval
  const isUnlimited =
    amount === 'unlimited' ||
    amount === '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' ||
    BigInt(amount) > BigInt('0xffffffffffffffffffff');

  if (!isUnlimited) return null;

  return (
    <div className="bg-yellow-900/20 border border-yellow-600 rounded-lg p-3">
      <div className="flex items-start gap-2">
        <WarningIcon />
        <div>
          <h5 className="font-medium text-yellow-400">Unlimited Approval Requested</h5>
          <p className="mt-1 text-sm text-dark-300">
            This will allow the contract to spend <strong>all</strong> your {tokenSymbol}.
            Consider setting a specific amount instead for better security.
          </p>
          <p className="mt-1 text-xs text-dark-400 font-mono">
            Spender: {spenderAddress}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Security info footer
 */
export function SecurityFooter() {
  return (
    <div className="flex items-center justify-center gap-2 text-xs text-dark-400 py-4">
      <ShieldCheckIcon />
      <span>All transactions are signed locally in your wallet</span>
    </div>
  );
}

// Icons
function ShieldAlertIcon() {
  return (
    <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M20.618 5.984A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016zM12 9v2m0 4h.01"
      />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
  );
}

function ShieldCheckIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
      />
    </svg>
  );
}

export default SecurityWarning;
