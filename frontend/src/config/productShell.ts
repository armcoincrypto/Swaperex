/**
 * Primary shell navigation — P4.2 DEX Command Center labels.
 * Internal page ids unchanged; routes and lazy chunks stay compatible.
 */
export const SHOW_OPTIONAL_PRIMARY_NAV = true;

export type ShellNavPage = 'swap' | 'send' | 'portfolio' | 'radar' | 'screener';

export interface ShellNavItem {
  page: ShellNavPage;
  label: string;
  /** Pages that highlight this nav item as active */
  activeWhen: ShellNavPage[];
}

/** Command-center nav: Trade · Portfolio · Security · Markets */
export const PRIMARY_NAV_ITEMS: ShellNavItem[] = [
  { page: 'swap', label: 'Trade', activeWhen: ['swap', 'send'] },
  { page: 'portfolio', label: 'Portfolio', activeWhen: ['portfolio'] },
  { page: 'radar', label: 'Security', activeWhen: ['radar'] },
  { page: 'screener', label: 'Markets', activeWhen: ['screener'] },
];

export const TRADE_SUB_NAV: Array<{ page: 'swap' | 'send'; label: string }> = [
  { page: 'swap', label: 'Swap' },
  { page: 'send', label: 'Send' },
];
