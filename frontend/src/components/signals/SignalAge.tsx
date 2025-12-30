/**
 * Signal Age Component
 *
 * Live-updating relative time display for signal timestamps.
 * Updates every second for recent signals, less frequently for older ones.
 *
 * Priority 10.3.1 - Signal Age Indicator
 */

import { useState, useEffect } from 'react';

interface SignalAgeProps {
  timestamp: number;
  /** Compact mode - shorter format */
  compact?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Format timestamp to relative time string
 */
function formatAge(timestamp: number, compact: boolean = false): string {
  const now = Date.now();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (compact) {
    if (seconds < 60) return 'now';
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    return `${days}d`;
  }

  if (seconds < 10) return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (minutes === 1) return '1 min ago';
  if (minutes < 60) return `${minutes} min ago`;
  if (hours === 1) return '1 hour ago';
  if (hours < 24) return `${hours} hours ago`;
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

/**
 * Calculate update interval based on age
 * - <1 min: update every second
 * - <1 hour: update every minute
 * - <24 hours: update every 5 minutes
 * - older: update every hour
 */
function getUpdateInterval(timestamp: number): number {
  const diff = Date.now() - timestamp;
  const minutes = diff / (1000 * 60);
  const hours = diff / (1000 * 60 * 60);

  if (minutes < 1) return 1000; // 1 second
  if (hours < 1) return 60 * 1000; // 1 minute
  if (hours < 24) return 5 * 60 * 1000; // 5 minutes
  return 60 * 60 * 1000; // 1 hour
}

export function SignalAge({ timestamp, compact = false, className = '' }: SignalAgeProps) {
  const [age, setAge] = useState(() => formatAge(timestamp, compact));

  useEffect(() => {
    // Update immediately
    setAge(formatAge(timestamp, compact));

    // Set up interval for live updates
    let timeoutId: ReturnType<typeof setTimeout>;

    const scheduleUpdate = () => {
      const interval = getUpdateInterval(timestamp);
      timeoutId = setTimeout(() => {
        setAge(formatAge(timestamp, compact));
        scheduleUpdate();
      }, interval);
    };

    scheduleUpdate();

    return () => {
      clearTimeout(timeoutId);
    };
  }, [timestamp, compact]);

  return (
    <span className={`font-mono ${className}`} title={new Date(timestamp).toLocaleString()}>
      {age}
    </span>
  );
}

export default SignalAge;
