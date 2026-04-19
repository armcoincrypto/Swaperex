/**
 * Phase 1 — 1inch-only platform fee (env-driven).
 * Uniswap / Pancake paths are unchanged.
 */

import { isAddress } from 'ethers';

/** 1inch integrator fee is capped at 3% (Classic Swap docs). */
export const MAX_PLATFORM_FEE_BPS = 300;

export interface MonetizationConfig {
  enabled: boolean;
  /** Basis points (100 bps = 1%). Clamped 0–300. */
  feeBps: number;
  /** Checksummed or lowercase 0x address, or null if invalid / empty. */
  recipient: string | null;
}

function parseBoolEnv(value: string | undefined): boolean {
  if (value == null || value.trim() === '') return false;
  const v = value.trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes';
}

function parseFeeBpsRaw(value: string | undefined): number {
  if (value == null || value.trim() === '') return 0;
  const n = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(MAX_PLATFORM_FEE_BPS, Math.floor(n));
}

function parseRecipientRaw(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (!isAddress(trimmed)) return null;
  return trimmed;
}

/**
 * Typed monetization config from Vite env (baked at build time).
 */
export function getMonetizationConfig(): MonetizationConfig {
  const enabled = parseBoolEnv(import.meta.env.VITE_FEE_ENABLED);
  const feeBps = parseFeeBpsRaw(import.meta.env.VITE_FEE_BPS);
  const recipient = parseRecipientRaw(import.meta.env.VITE_FEE_RECIPIENT);
  return { enabled, feeBps, recipient };
}

/**
 * Whether fee/referrer should be considered for a routing provider.
 * Phase 1: only 1inch supports this without a custom contract.
 */
export function isMonetizationActiveForProvider(provider: string): boolean {
  const { enabled, feeBps, recipient } = getMonetizationConfig();
  return provider === '1inch' && enabled && feeBps > 0 && recipient != null;
}

/**
 * 1inch `fee` query param: partner fee as a **percentage** (e.g. 0.3 = 0.3%), not raw bps.
 * @see https://portal.1inch.dev/documentation/apis/swap/classic-swap/introduction (integrator fee)
 */
export function feeBpsToOneInchFeePercent(feeBps: number): number {
  return feeBps / 100;
}

/** String for 1inch `fee` query param (percent, e.g. "0.30" for 30 bps). */
export function formatOneInchFeeParam(feeBps: number): string {
  if (feeBps <= 0) return '0';
  return (feeBps / 100).toFixed(2);
}
