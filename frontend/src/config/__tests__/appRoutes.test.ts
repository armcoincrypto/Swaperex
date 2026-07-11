import { describe, expect, it } from 'vitest';
import {
  APP_ROUTE_PATHS,
  footerPageToPath,
  isKnownPublicPath,
  isTradePage,
  pageToPath,
  pathToPage,
} from '@/config/appRoutes';

describe('appRoutes', () => {
  it('maps product tab paths to pages', () => {
    expect(pathToPage('/')).toBe('swap');
    expect(pathToPage('/swap')).toBe('swap');
    expect(pathToPage('/send')).toBe('send');
    expect(pathToPage('/portfolio')).toBe('portfolio');
    expect(pathToPage('/radar')).toBe('radar');
    expect(pathToPage('/screener')).toBe('screener');
  });

  it('maps informational paths', () => {
    expect(pathToPage('/trust')).toBe('trust');
    expect(pathToPage('/about')).toBe('about');
  });

  it('returns null for unknown paths', () => {
    expect(pathToPage('/unknown-tab')).toBeNull();
    expect(isKnownPublicPath('/foo')).toBe(false);
  });

  it('normalizes trailing slashes', () => {
    expect(pathToPage('/portfolio/')).toBe('portfolio');
  });

  it('pageToPath returns canonical routes', () => {
    expect(pageToPath('swap')).toBe('/swap');
    expect(pageToPath('send')).toBe('/send');
    expect(pageToPath('portfolio')).toBe('/portfolio');
  });

  it('footerPageToPath appends section hash', () => {
    expect(footerPageToPath('portfolio', 'holdings')).toBe('/portfolio#holdings');
    expect(footerPageToPath('swap')).toBe(APP_ROUTE_PATHS.swap);
  });

  it('identifies trade pages', () => {
    expect(isTradePage('send')).toBe(true);
    expect(isTradePage('trust')).toBe(false);
  });
});
