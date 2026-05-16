/**
 * P4 — Compact landing education below the swap row (no hero above the form).
 */

import { Link } from 'react-router-dom';

const linkClass =
  'text-accent/90 hover:text-accent underline-offset-2 hover:underline font-medium text-sm';

export function DexLandingIntro() {
  return (
    <section
      className="mt-8 pt-6 border-t border-white/[0.06]"
      aria-labelledby="kobbex-dex-landing-intro-heading"
    >
      <h2 id="kobbex-dex-landing-intro-heading" className="sr-only">
        About Kobbex DEX
      </h2>
      <p className="text-sm text-dark-300 leading-relaxed max-w-3xl mx-auto text-center">
        <strong className="text-dark-200">Kobbex DEX</strong> is a non-custodial swap interface: you
        connect your wallet, review quotes, and sign transactions yourself. Read more in{' '}
        <Link to="/about" className={linkClass}>
          About
        </Link>
        , plus{' '}
        <Link to="/terms" className={linkClass}>
          Terms
        </Link>
        ,{' '}
        <Link to="/privacy" className={linkClass}>
          Privacy
        </Link>
        , and{' '}
        <Link to="/disclaimer" className={linkClass}>
          Disclaimer
        </Link>
        .
      </p>
    </section>
  );
}
