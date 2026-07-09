/**
 * P9.2 — Premium hero workspace wrapper (CSS-only polish around swap column).
 */

import type { ReactNode } from 'react';

interface HomepageHeroWorkspaceProps {
  children: ReactNode;
}

export function HomepageHeroWorkspace({ children }: HomepageHeroWorkspaceProps) {
  return (
    <div className="homepage-hero-workspace relative min-w-0 flex-1">
      <div className="homepage-hero-workspace__glow" aria-hidden />
      <div className="homepage-hero-workspace__mesh" aria-hidden />
      <div className="relative z-[1]">{children}</div>
    </div>
  );
}

export default HomepageHeroWorkspace;
