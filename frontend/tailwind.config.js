/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Electro DEX Theme
        electro: {
          bg: '#0B0E14',
          bgAlt: '#080A0F',
          panel: '#11151F',
          panelHover: '#161B28',
        },
        accent: {
          DEFAULT: '#2EFF8B',
          muted: 'rgba(46,255,139,0.15)',
          glow: 'rgba(46,255,139,0.25)',
        },
        cyan: {
          DEFAULT: '#00D4FF',
          muted: 'rgba(0,212,255,0.15)',
        },
        violet: {
          DEFAULT: '#9D4EDD',
          muted: 'rgba(157,78,221,0.15)',
        },
        danger: {
          DEFAULT: '#FF4D4F',
          muted: 'rgba(255,77,79,0.15)',
        },
        warning: {
          DEFAULT: '#FFB020',
          muted: 'rgba(255,176,32,0.15)',
        },
        // Legacy colors for compatibility
        primary: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
        },
        dark: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617',
        },
      },
      boxShadow: {
        'glow-accent': '0 0 20px rgba(46,255,139,0.25)',
        'glow-accent-strong': '0 0 30px rgba(46,255,139,0.4)',
        'glow-accent-subtle': '0 0 12px rgba(46,255,139,0.15)',
        'glow-cyan': '0 0 20px rgba(0,212,255,0.25)',
        'glow-danger': '0 0 20px rgba(255,77,79,0.25)',
        'glow-warning': '0 0 20px rgba(255,176,32,0.25)',
        'glass': '0 4px 24px rgba(0,0,0,0.4)',
        'inner-highlight': 'inset 0 1px 0 rgba(255,255,255,0.05)',
      },
      backdropBlur: {
        'glass': '12px',
      },
      borderRadius: {
        'glass': '16px',
        'glass-sm': '12px',
        'glass-lg': '20px',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'glass-gradient': 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, transparent 50%)',
        'hover-gradient': 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, transparent 50%)',
        'accent-gradient': 'linear-gradient(135deg, #2EFF8B 0%, #00D4FF 100%)',
        'danger-gradient': 'linear-gradient(135deg, #FF4D4F 0%, #FF7875 100%)',
        'bg-mesh': `radial-gradient(ellipse at 20% 0%, rgba(46,255,139,0.08) 0%, transparent 50%),
                    radial-gradient(ellipse at 80% 100%, rgba(0,212,255,0.06) 0%, transparent 50%)`,
      },
      animation: {
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
        'fade-in': 'fade-in 200ms ease-out',
        'slide-up': 'slide-up 200ms ease-out',
        'scale-in': 'scale-in 200ms cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      keyframes: {
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 20px rgba(46,255,139,0.25)' },
          '50%': { boxShadow: '0 0 30px rgba(46,255,139,0.4)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
};
