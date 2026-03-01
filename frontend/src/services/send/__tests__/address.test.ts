/**
 * Address Utility Tests
 */

import { describe, it, expect } from 'vitest';
import { validateAddress, toChecksumAddress } from '@/utils/address';

describe('validateAddress', () => {
  it('validates a correct checksum address', () => {
    const result = validateAddress('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045');
    expect(result.valid).toBe(true);
    expect(result.checksummed).toBe('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045');
  });

  it('validates a lowercase address and returns checksummed', () => {
    const result = validateAddress('0xd8da6bf26964af9d7eed9e03e53415d37aa96045');
    expect(result.valid).toBe(true);
    expect(result.checksummed).toBe('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045');
  });

  it('rejects empty string', () => {
    const result = validateAddress('');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Address is required');
  });

  it('rejects invalid address', () => {
    const result = validateAddress('not-an-address');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Invalid address format');
  });

  it('rejects too-short address', () => {
    const result = validateAddress('0x1234');
    expect(result.valid).toBe(false);
  });

  it('detects ENS names', () => {
    const result = validateAddress('vitalik.eth');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('ENS_NAME');
  });

  it('handles whitespace', () => {
    const result = validateAddress('  0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045  ');
    expect(result.valid).toBe(true);
  });
});

describe('toChecksumAddress', () => {
  it('converts lowercase to checksum', () => {
    expect(toChecksumAddress('0xd8da6bf26964af9d7eed9e03e53415d37aa96045')).toBe(
      '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    );
  });

  it('returns input unchanged if invalid', () => {
    expect(toChecksumAddress('invalid')).toBe('invalid');
  });
});
