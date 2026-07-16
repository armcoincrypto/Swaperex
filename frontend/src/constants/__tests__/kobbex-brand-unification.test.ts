/**
 * Kobbex brand unification — public-facing brand consistency contracts.
 * Ensures the product presents as "Kobbex" with no residual public "Swaperex"
 * branding or "by Kobbex" byline. Internal identifiers/storage keys are out of scope.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { BRAND, brandPageTitle } from '@/constants/brand';
import { SWAP_SURFACE_COPY } from '@/constants/swapSurfaceCopy';
import { ACTIVITY_HISTORY_DISCLAIMER } from '@/types/unifiedActivity';

const root = path.resolve(__dirname, '../../..');
const read = (rel: string) => fs.readFileSync(path.resolve(root, rel), 'utf8');

describe('Kobbex brand constant', () => {
  it('uses Kobbex as the single product name with no byline', () => {
    expect(BRAND.productName).toBe('Kobbex');
    expect(BRAND.displayName).toBe('Kobbex');
    expect(BRAND.lockupShort).toBe('Kobbex');
    expect(BRAND.byline).toBe('');
  });

  it('builds page titles without "by Kobbex"', () => {
    expect(brandPageTitle('Portfolio')).toBe('Portfolio — Kobbex');
    expect(brandPageTitle('Portfolio')).not.toMatch(/by Kobbex/i);
    expect(brandPageTitle('Portfolio')).not.toMatch(/Swaperex/i);
  });
});

describe('Public copy is unbranded of Swaperex', () => {
  it('swap surface fee label + trust copy use Kobbex, not Swaperex', () => {
    expect(SWAP_SURFACE_COPY.swaperexFeeLabel).toBe('Kobbex fee');
    expect(SWAP_SURFACE_COPY.footerTrustLocalSigning).not.toMatch(/Swaperex/);
    expect(SWAP_SURFACE_COPY.customTokenRiskAckLabel).not.toMatch(/Swaperex/);
    expect(SWAP_SURFACE_COPY.previewWrapperNetFeeNote).not.toMatch(/Swaperex/);
  });

  it('activity history disclaimer is not branded Swaperex', () => {
    expect(ACTIVITY_HISTORY_DISCLAIMER).not.toMatch(/Swaperex/);
    expect(ACTIVITY_HISTORY_DISCLAIMER).toMatch(/Kobbex/);
  });
});

describe('index.html metadata + manifest surfaces use Kobbex', () => {
  const html = read('index.html');

  it('title, description, og, twitter, and app name use Kobbex only', () => {
    expect(html).not.toMatch(/Swaperex/);
    expect(html).not.toMatch(/by Kobbex/);
    expect(html).toMatch(/<title>Kobbex/);
    expect(html).toMatch(/property="og:site_name" content="Kobbex"/);
    expect(html).toMatch(/name="application-name" content="Kobbex"/);
  });
});

describe('Structured data + footer', () => {
  it('structured data names the org/site Kobbex', () => {
    const sd = read('src/utils/structuredData.ts');
    expect(sd).not.toMatch(/name: 'Swaperex'/);
    expect(sd).toMatch(/name: 'Kobbex'/);
  });

  it('footer copyright renders Kobbex without a byline', () => {
    const footer = read('src/components/layout/DexSiteFooter.tsx');
    expect(footer).not.toMatch(/BRAND\.byline/);
    expect(footer).toMatch(/BRAND\.displayName/);
  });

  it('BrandLogo exposes the Kobbex home accessible name', () => {
    const logo = read('src/components/brand/BrandLogo.tsx');
    expect(logo).toMatch(/aria-label="Kobbex home"/);
    expect(logo).not.toMatch(/aria-label="Swaperex home"/);
  });
});
