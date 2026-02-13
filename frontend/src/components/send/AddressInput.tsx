/**
 * Address Input for Send v2
 *
 * Features:
 * - ENS resolution on Ethereum
 * - Checksum validation + auto-format
 * - Contract address detection + warning
 * - Address book (saved contacts)
 * - Recent addresses
 * - "My address" helper
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useWallet } from '@/hooks/useWallet';
import { useSendStore } from '@/stores/sendStore';
import { validateAddress, isContractAddress, resolveENS } from '@/utils/address';
import { shortenAddress } from '@/utils/format';

interface Props {
  value: string;
  onChange: (address: string) => void;
  chainId: number;
  ownAddress: string | null;
  error?: string | null;
}

export function AddressInput({ value, onChange, chainId, ownAddress, error: externalError }: Props) {
  const { provider } = useWallet();
  const { contacts, recentAddresses, addContact, removeContact } = useSendStore();

  const [showDropdown, setShowDropdown] = useState(false);
  const [ensResolving, setEnsResolving] = useState(false);
  const [ensResult, setEnsResult] = useState<string | null>(null);
  const [isContract, setIsContract] = useState(false);
  const [contractChecked, setContractChecked] = useState(false);
  const [showSaveContact, setShowSaveContact] = useState(false);
  const [contactName, setContactName] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const ensTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Validate current input
  const validation = value ? validateAddress(value) : null;
  const isValid = validation?.valid || ensResult != null;
  const resolvedAddress = ensResult || (validation?.valid ? validation.checksummed : '');

  // ENS resolution (debounced, Ethereum only)
  useEffect(() => {
    setEnsResult(null);
    setIsContract(false);
    setContractChecked(false);

    if (ensTimerRef.current) clearTimeout(ensTimerRef.current);

    if (!value || !value.endsWith('.eth') || chainId !== 1 || !provider) return;

    setEnsResolving(true);
    ensTimerRef.current = setTimeout(async () => {
      const resolved = await resolveENS(value, provider);
      setEnsResolving(false);
      if (resolved) {
        setEnsResult(resolved);
      }
    }, 500);

    return () => {
      if (ensTimerRef.current) clearTimeout(ensTimerRef.current);
    };
  }, [value, chainId, provider]);

  // Contract detection (when we have a valid address)
  useEffect(() => {
    if (!resolvedAddress || !provider || contractChecked) return;

    setContractChecked(true);
    isContractAddress(resolvedAddress, provider).then(setIsContract);
  }, [resolvedAddress, provider, contractChecked]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handlePaste = useCallback((addr: string) => {
    onChange(addr);
    setShowDropdown(false);
  }, [onChange]);

  const handleSaveContact = () => {
    if (!contactName.trim() || !resolvedAddress) return;
    addContact({ name: contactName.trim(), address: resolvedAddress, chainId });
    setShowSaveContact(false);
    setContactName('');
  };

  // Is this address the user's own address?
  const isSelf = ownAddress && resolvedAddress &&
    resolvedAddress.toLowerCase() === ownAddress.toLowerCase();

  // Find matching contact
  const matchedContact = contacts.find(
    (c) => c.address.toLowerCase() === resolvedAddress?.toLowerCase(),
  );

  return (
    <div className="bg-dark-800 rounded-xl p-4 mb-4" ref={dropdownRef}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-dark-400">Destination Address</span>
        <div className="flex items-center gap-2">
          {/* My address button */}
          {ownAddress && (
            <button
              onClick={() => handlePaste(ownAddress)}
              className="text-xs text-primary-400 hover:text-primary-300"
              title="Use your connected address"
            >
              My Address
            </button>
          )}
          {/* Contacts button */}
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="text-xs text-dark-400 hover:text-white"
          >
            Contacts
          </button>
        </div>
      </div>

      {/* Input */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => value === '' && setShowDropdown(true)}
          placeholder="0x... or ENS name (.eth)"
          className={`w-full bg-dark-700 border rounded-xl px-3 py-3 text-sm font-mono outline-none transition-colors ${
            externalError || (value && !isValid && !ensResolving)
              ? 'border-red-700'
              : isValid && value
                ? 'border-green-700'
                : 'border-dark-600 focus:border-primary-500'
          }`}
        />
        {ensResolving && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <svg className="animate-spin w-4 h-4 text-dark-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        )}
      </div>

      {/* Status messages */}
      <div className="mt-2 space-y-1">
        {/* ENS resolved */}
        {ensResult && (
          <p className="text-xs text-green-400 flex items-center gap-1">
            <span>Resolved:</span>
            <span className="font-mono">{shortenAddress(ensResult, 6)}</span>
          </p>
        )}

        {/* Contact name */}
        {matchedContact && (
          <p className="text-xs text-primary-400">
            Contact: {matchedContact.name}
          </p>
        )}

        {/* Contract warning */}
        {isContract && isValid && (
          <p className="text-xs text-yellow-400 flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            This is a contract address. Only send if you know it accepts transfers.
          </p>
        )}

        {/* Self-send warning */}
        {isSelf && (
          <p className="text-xs text-yellow-400">
            This is your own connected address.
          </p>
        )}

        {/* Validation error */}
        {externalError && (
          <p className="text-xs text-red-400">{externalError}</p>
        )}
        {!externalError && value && !isValid && !ensResolving && validation?.error !== 'ENS_NAME' && (
          <p className="text-xs text-red-400">
            {validation?.error || 'Invalid address'}
          </p>
        )}
      </div>

      {/* Save as contact */}
      {isValid && !matchedContact && resolvedAddress && (
        <div className="mt-2">
          {showSaveContact ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="Contact name..."
                className="flex-1 bg-dark-700 border border-dark-600 rounded-lg px-2 py-1 text-xs text-white placeholder-dark-500 focus:outline-none focus:border-primary-500"
                onKeyDown={(e) => e.key === 'Enter' && handleSaveContact()}
                autoFocus
              />
              <button
                onClick={handleSaveContact}
                className="text-xs text-primary-400 hover:text-primary-300"
                disabled={!contactName.trim()}
              >
                Save
              </button>
              <button
                onClick={() => setShowSaveContact(false)}
                className="text-xs text-dark-400 hover:text-white"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowSaveContact(true)}
              className="text-xs text-dark-400 hover:text-white"
            >
              + Save as contact
            </button>
          )}
        </div>
      )}

      {/* Contacts & Recent dropdown */}
      {showDropdown && (
        <div className="mt-2 bg-dark-700 rounded-xl max-h-48 overflow-y-auto">
          {/* Saved contacts */}
          {contacts.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-dark-500 border-b border-dark-600">
                Saved Contacts
              </div>
              {contacts.map((c) => (
                <div
                  key={c.address}
                  className="flex items-center justify-between px-3 py-2 hover:bg-dark-600 transition-colors cursor-pointer"
                  onClick={() => handlePaste(c.address)}
                >
                  <div>
                    <div className="text-sm font-medium">{c.name}</div>
                    <div className="text-xs text-dark-400 font-mono">
                      {shortenAddress(c.address, 6)}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeContact(c.address);
                    }}
                    className="text-dark-500 hover:text-red-400 text-xs"
                    title="Remove contact"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </>
          )}

          {/* Recent addresses */}
          {recentAddresses.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-dark-500 border-b border-dark-600">
                Recent
              </div>
              {recentAddresses.map((addr) => (
                <button
                  key={addr}
                  onClick={() => handlePaste(addr)}
                  className="w-full text-left px-3 py-2 hover:bg-dark-600 transition-colors"
                >
                  <span className="text-xs font-mono text-dark-300">
                    {shortenAddress(addr, 8)}
                  </span>
                </button>
              ))}
            </>
          )}

          {contacts.length === 0 && recentAddresses.length === 0 && (
            <div className="px-3 py-3 text-center text-dark-400 text-xs">
              No saved contacts or recent addresses
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AddressInput;
