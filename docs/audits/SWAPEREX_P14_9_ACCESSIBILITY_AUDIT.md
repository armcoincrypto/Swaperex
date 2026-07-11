# SWAPEREX P14.9 — Accessibility Audit

**Program:** P14 | **Date:** 2026-07-10  
**Method:** Source grep + component review. No live screen reader session.

---

## Verdict

**P14_9_ACCESSIBILITY_PASS_WITH_GAPS**

---

## Findings register

| ID | Finding | Class | Status |
|----|---------|-------|--------|
| A1 | `aria-live="polite"` on quote updates | BEST_PRACTICE | **CONFIRMED** |
| A2 | `sr-only` text on swap CTA | BEST_PRACTICE | **CONFIRMED** |
| A3 | `focus-visible:ring` on token selector | BEST_PRACTICE | **CONFIRMED** |
| A4 | FAQ uses `<details>` without native keyboard issues | OK | **CONFIRMED** |
| A5 | Token selector may lack full combobox ARIA pattern | HIGH | **SOURCE REVIEW** |
| A6 | Reown modal accessibility delegated to vendor | MEDIUM | **PARTIAL** |
| A7 | Color contrast on `text-dark-500` secondary | MEDIUM | **NOT TESTED** with tool |
| A8 | Global error display focus management | MEDIUM | **NOT CONFIRMED** |
| A9 | Skip navigation link absent | LOW | **MISSING** |
| A10 | Reduced motion preferences not grep-matched | LOW | **MISSING** |

---

## Keyboard navigation

- Buttons and links generally focusable
- Modal focus trap: Reown vendor + custom `Modal.tsx`
- Token dropdown keyboard: **PARTIALLY CONFIRMED** — needs manual audit

---

## Touch targets

- Primary swap CTA and token buttons use `min-h-[3.25rem]` — **PASS** guideline

---

## Recommendations

1. **P19** — Run axe/Lighthouse a11y on production
2. **P19** — Token selector combobox semantics
3. **P19** — `prefers-reduced-motion` for animations
4. **OPTIONAL** — Skip to swap content link

---

## Blockers

None identified at source level for core swap path.
