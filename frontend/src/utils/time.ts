/**
 * Time Formatting Utilities
 *
 * Shared time formatting functions used across components.
 */

/**
 * Format a timestamp as a relative time string (e.g., "5m ago", "2h ago")
 *
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Human-readable relative time string
 */
export function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  // For older timestamps, show localized date
  return new Date(timestamp).toLocaleDateString();
}

/**
 * Alias for formatTimeAgo for backward compatibility
 * Some components use this name instead
 */
export const formatRelativeTime = formatTimeAgo;
