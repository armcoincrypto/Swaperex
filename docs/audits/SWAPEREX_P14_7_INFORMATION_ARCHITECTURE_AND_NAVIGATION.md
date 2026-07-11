# SWAPEREX P14.7 — Information Architecture and Navigation Audit

**Program:** P14 | **Date:** 2026-07-10

---

## Verdict

**P14_7_INFORMATION_ARCHITECTURE_NEEDS_IMPROVEMENT**

---

## Route model

| URL | Content | Crawlable |
|-----|---------|-----------|
| `/` | Swap (default) + in-shell tabs | Yes |
| `/trust` | Trust Center | Yes |
| `/about`, `/terms`, `/privacy`, `/disclaimer` | Static pages | Yes |
| `/admin/*` | Operator dashboard | Yes (gated by token) |
| `/send`, `/portfolio`, `/radar`, `/screener` | **No dedicated URLs** | **No** |

In-shell tabs use React state (`currentPage`) — refreshing on a tab still shows `/` with swap default unless user navigated via footer internal scroll.

---

## Header navigation (CONFIRMED)

Primary nav (`productShell.ts`):
- **Trade** → Swap / Send sub-nav
- **Portfolio**
- **Security** (Radar)
- **Markets** (Screener)

Wallet connect in header (lazy loaded on swap/send/portfolio or when connected).

---

## Footer navigation (CONFIRMED)

Six columns: brand, Trade, Portfolio, Security, Markets, Legal + system status.

Legal links use React Router on passive routes; in-shell uses `onNavigate` state.

---

## Discovery issues

| Issue | Type | Severity |
|-------|------|----------|
| Portfolio/Radar/Screener not URL-addressable | Hidden functionality | **HIGH** |
| Trust Center discoverable via footer + `/trust` | OK | — |
| Admin not linked from user UI | OK (intentional) | — |
| Back navigation from static pages | "Back to swap" button | OK |
| Active nav state | Highlights Trade for send | OK |
| Breadcrumbs | Absent | LOW |
| Duplicate static page loading | TradeShell + App both lazy-load static pages | LOW tech debt |

---

## Broken links

Production smoke: all static routes HTTP 200 — **no broken links confirmed**.

---

## Mobile navigation

Hamburger not used — horizontal nav with wrap. On narrow viewports nav may compress — **PARTIALLY CONFIRMED** from responsive classes.

---

## Recommendations

1. **P16** — Add `/portfolio`, `/radar`, `/screener`, `/send` routes (or query params)
2. **P11 SEO** — Extend sitemap if new routes added
3. Keep admin unlinked from consumer nav
