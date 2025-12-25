/**
 * GlassPanel Component
 *
 * Electro DEX glass morphism panel with subtle gradient overlay.
 * Use as container for all major UI sections.
 */

import React from 'react';

interface GlassPanelProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'elevated' | 'subtle';
  hover?: boolean;
  glow?: 'none' | 'accent' | 'cyan' | 'danger' | 'warning';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  onClick?: () => void;
}

const paddingClasses = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
};

const glowClasses = {
  none: '',
  accent: 'shadow-glow-accent',
  cyan: 'shadow-glow-cyan',
  danger: 'shadow-glow-danger',
  warning: 'shadow-glow-warning',
};

export function GlassPanel({
  children,
  className = '',
  variant = 'default',
  hover = false,
  glow = 'none',
  padding = 'md',
  onClick,
}: GlassPanelProps) {
  const baseClasses = `
    relative overflow-hidden
    rounded-glass
    border border-white/[0.08]
    backdrop-blur-glass
    transition-all duration-200
  `;

  const variantClasses = {
    default: 'bg-electro-panel/85',
    elevated: 'bg-electro-panel/90 shadow-glass',
    subtle: 'bg-electro-panel/60',
  };

  const hoverClasses = hover
    ? 'hover:bg-electro-panelHover hover:border-white/[0.12] cursor-pointer'
    : '';

  return (
    <div
      className={`
        ${baseClasses}
        ${variantClasses[variant]}
        ${hoverClasses}
        ${glowClasses[glow]}
        ${paddingClasses[padding]}
        ${className}
      `}
      onClick={onClick}
    >
      {/* Subtle gradient overlay */}
      <div className="absolute inset-0 bg-glass-gradient pointer-events-none" />
      {/* Content */}
      <div className="relative z-10">{children}</div>
    </div>
  );
}

/**
 * GlassCard - Smaller variant for list items and cards
 */
interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  active?: boolean;
  onClick?: () => void;
}

export function GlassCard({
  children,
  className = '',
  hover = true,
  active = false,
  onClick,
}: GlassCardProps) {
  return (
    <div
      className={`
        relative overflow-hidden
        rounded-glass-sm
        border border-white/[0.06]
        bg-electro-panel/70
        backdrop-blur-glass
        transition-all duration-200
        ${hover ? 'hover:bg-electro-panelHover hover:border-white/[0.1] cursor-pointer' : ''}
        ${active ? 'border-accent/30 bg-accent/5' : ''}
        ${className}
      `}
      onClick={onClick}
    >
      <div className="absolute inset-0 bg-glass-gradient pointer-events-none" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

/**
 * GlassInput - Styled input container
 */
interface GlassInputProps {
  children: React.ReactNode;
  className?: string;
  focused?: boolean;
  error?: boolean;
}

export function GlassInput({
  children,
  className = '',
  focused = false,
  error = false,
}: GlassInputProps) {
  return (
    <div
      className={`
        relative overflow-hidden
        rounded-glass-sm
        border
        bg-electro-bgAlt/80
        backdrop-blur-glass
        transition-all duration-200
        ${error
          ? 'border-danger/50 shadow-glow-danger'
          : focused
            ? 'border-accent/30 shadow-glow-accent-subtle'
            : 'border-white/[0.06] hover:border-white/[0.1]'
        }
        ${className}
      `}
    >
      {children}
    </div>
  );
}

/**
 * GlassButton - Primary action button with glow effect
 */
interface GlassButtonProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  glow?: boolean;
  onClick?: () => void;
}

export function GlassButton({
  children,
  className = '',
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  glow = false,
  onClick,
}: GlassButtonProps) {
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm rounded-lg',
    md: 'px-4 py-2.5 text-sm rounded-glass-sm',
    lg: 'px-6 py-3.5 text-base rounded-glass',
  };

  const variantClasses = {
    primary: `
      bg-accent text-electro-bg font-semibold
      hover:brightness-110
      ${glow ? 'shadow-glow-accent animate-glow-pulse' : ''}
      disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:animate-none
    `,
    secondary: `
      bg-electro-panel border border-white/[0.1] text-white
      hover:bg-electro-panelHover hover:border-white/[0.15]
      disabled:opacity-50 disabled:cursor-not-allowed
    `,
    danger: `
      bg-danger text-white font-semibold
      hover:brightness-110
      ${glow ? 'shadow-glow-danger' : ''}
      disabled:opacity-50 disabled:cursor-not-allowed
    `,
    ghost: `
      bg-transparent text-gray-400
      hover:text-white hover:bg-white/[0.05]
      disabled:opacity-50 disabled:cursor-not-allowed
    `,
  };

  return (
    <button
      className={`
        relative overflow-hidden
        transition-all duration-200
        ${sizeClasses[size]}
        ${variantClasses[variant]}
        ${className}
      `}
      disabled={disabled || loading}
      onClick={onClick}
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
              fill="none"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <span>Loading...</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
}

/**
 * GlassDivider - Subtle divider line
 */
export function GlassDivider({ className = '' }: { className?: string }) {
  return (
    <div
      className={`h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent ${className}`}
    />
  );
}

/**
 * GlassBadge - Status badge with optional glow
 */
interface GlassBadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  size?: 'sm' | 'md';
  className?: string;
}

export function GlassBadge({
  children,
  variant = 'default',
  size = 'sm',
  className = '',
}: GlassBadgeProps) {
  const variantClasses = {
    default: 'bg-white/[0.08] text-gray-300',
    success: 'bg-accent/15 text-accent border-accent/20',
    warning: 'bg-warning/15 text-warning border-warning/20',
    danger: 'bg-danger/15 text-danger border-danger/20',
    info: 'bg-cyan/15 text-cyan border-cyan/20',
  };

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm',
  };

  return (
    <span
      className={`
        inline-flex items-center gap-1
        rounded-full border
        font-medium
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${className}
      `}
    >
      {children}
    </span>
  );
}

export default GlassPanel;
