# SWAPEREX P14.11 — SEO, Discoverability, and Public Credibility Audit

**Program:** P14 | **Date:** 2026-07-10

---

## Verdict

**P14_11_SEO_FOUNDATION_PASS**

(Foundation solid for a SPA; ranking competitiveness **limited** by scope and content depth.)

---

## On-page SEO (CONFIRMED production curl)

| Element | Status |
|---------|--------|
| `<title>` | "Swaperex" on `/` |
| Meta description | Present — mentions ETH/BSC non-custodial |
| Canonical | `https://dex.kobbex.com/` |
| Open Graph | title, description, url, type, site_name, locale |
| Twitter card | summary |
| Favicon | `/favicon.svg` |
| robots.txt | Present (Cloudflare content-signals format) |
| sitemap.xml | 6 URLs (/, trust, about, terms, privacy, disclaimer) |

---

## Client-side SEO (CONFIRMED source)

- `applyClientRouteSeo()` updates head on navigation
- JSON-LD: Organization, WebSite, FAQPage on `/` (`structuredData.ts`)
- Public routes get distinct titles ("About — Kobbex DEX", etc.)

---

## Gaps

| Gap | Severity |
|-----|----------|
| In-app tabs not in sitemap | MEDIUM |
| Brand split Swaperex vs Kobbex DEX | MEDIUM |
| No og:image confirmed in production HTML | MEDIUM |
| No manifest.json grep hit | LOW |
| Limited long-form content for competitive keywords | EXPECTED |

---

## Indexability

Static routes return 200 SPA shell — crawlable with JS execution.

Tab content (portfolio, screener) **not indexable** as separate pages.

---

## Keyword credibility (honest assessment)

| Keyword | Likely rank |
|---------|-------------|
| "Swaperex" / "Kobbex DEX" | Possible branded |
| "DEX" / "token swap" | Unlikely without content investment |
| "Ethereum swap" | Long tail possible via FAQ schema |
| "BNB Chain swap" | Same |

---

## Recommendations

1. Add `og:image` asset (P18)
2. Unify brand in titles (P16)
3. Add tab routes to sitemap when URL routing added (P16/P17)
