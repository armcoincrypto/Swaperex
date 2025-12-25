/**
 * Electro DEX Design Tokens
 *
 * Design philosophy:
 * - Fast, Intelligent, Calm (not casino)
 * - Dark glass panels with soft neon accents
 * - Minimal borders, depth via blur + gradients
 */

// Core colors
export const colors = {
  // Backgrounds
  bg: '#0B0E14',
  bgAlt: '#080A0F',
  panel: '#11151F',
  panelHover: '#161B28',
  panelBorder: 'rgba(255,255,255,0.06)',

  // Accents
  accent: '#2EFF8B', // Primary green
  accentMuted: 'rgba(46,255,139,0.15)',
  cyan: '#00D4FF',
  cyanMuted: 'rgba(0,212,255,0.15)',
  violet: '#9D4EDD',
  violetMuted: 'rgba(157,78,221,0.15)',

  // Status
  success: '#2EFF8B',
  danger: '#FF4D4F',
  dangerMuted: 'rgba(255,77,79,0.15)',
  warning: '#FFB020',
  warningMuted: 'rgba(255,176,32,0.15)',

  // Text
  textPrimary: '#E6EAF2',
  textSecondary: '#B8BCC6',
  textMuted: '#8A8F98',
  textDisabled: '#5A5E66',

  // Special
  glass: 'rgba(17,21,31,0.85)',
  glassBorder: 'rgba(255,255,255,0.08)',
  glassHighlight: 'rgba(255,255,255,0.03)',
};

// Glow effects
export const glow = {
  accent: '0 0 20px rgba(46,255,139,0.25)',
  accentStrong: '0 0 30px rgba(46,255,139,0.4)',
  accentSubtle: '0 0 12px rgba(46,255,139,0.15)',
  cyan: '0 0 20px rgba(0,212,255,0.25)',
  danger: '0 0 20px rgba(255,77,79,0.25)',
  warning: '0 0 20px rgba(255,176,32,0.25)',
  panel: '0 4px 24px rgba(0,0,0,0.4)',
};

// Glass panel styles
export const glass = {
  background: 'rgba(17,21,31,0.85)',
  backdropBlur: 'blur(12px)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderHover: '1px solid rgba(255,255,255,0.12)',
  borderRadius: '16px',
  borderRadiusSm: '12px',
  borderRadiusLg: '20px',
};

// Gradients
export const gradients = {
  // Subtle panel gradient
  panel: 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, transparent 50%)',
  // Accent gradient for buttons
  accent: 'linear-gradient(135deg, #2EFF8B 0%, #00D4FF 100%)',
  // Danger gradient
  danger: 'linear-gradient(135deg, #FF4D4F 0%, #FF7875 100%)',
  // Hover overlay
  hoverOverlay: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, transparent 50%)',
  // Background mesh
  bgMesh: `radial-gradient(ellipse at 20% 0%, rgba(46,255,139,0.08) 0%, transparent 50%),
           radial-gradient(ellipse at 80% 100%, rgba(0,212,255,0.06) 0%, transparent 50%)`,
};

// Shadows
export const shadows = {
  sm: '0 2px 8px rgba(0,0,0,0.3)',
  md: '0 4px 16px rgba(0,0,0,0.4)',
  lg: '0 8px 32px rgba(0,0,0,0.5)',
  inner: 'inset 0 1px 0 rgba(255,255,255,0.05)',
};

// Animations
export const animations = {
  fast: '150ms ease-out',
  normal: '200ms ease-out',
  slow: '300ms ease-out',
  spring: '300ms cubic-bezier(0.34, 1.56, 0.64, 1)',
};

// Spacing scale
export const spacing = {
  xs: '4px',
  sm: '8px',
  md: '16px',
  lg: '24px',
  xl: '32px',
  xxl: '48px',
};

// Typography
export const typography = {
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  fontMono: "'JetBrains Mono', 'Fira Code', monospace",

  // Sizes
  xs: '0.75rem', // 12px
  sm: '0.875rem', // 14px
  base: '1rem', // 16px
  lg: '1.125rem', // 18px
  xl: '1.25rem', // 20px
  '2xl': '1.5rem', // 24px
  '3xl': '2rem', // 32px

  // Weights
  normal: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
};

// Z-index scale
export const zIndex = {
  dropdown: 50,
  modal: 100,
  tooltip: 150,
  toast: 200,
};

// Default export for convenience
export default {
  colors,
  glow,
  glass,
  gradients,
  shadows,
  animations,
  spacing,
  typography,
  zIndex,
};
