# SWAPEREX P14.8 — Visual Design, Responsive, and Comfort Audit

**Program:** P14 | **Date:** 2026-07-10

---

## Verdict

**P14_8_VISUAL_EXPERIENCE_PASS_WITH_POLISH_GAPS**

---

## Design system (documented from source)

| Token | Value |
|-------|-------|
| Theme | Dark electro (`bg-electro-bg`, `electro-panel`) |
| Accent | Primary accent color on brand |
| Typography | System + Tailwind scale; tabular nums on amounts |
| Radius | `rounded-xl` cards, `rounded-lg` buttons |
| Shadows | Subtle ring borders `ring-white/[0.03]` |
| Background | Mesh gradient `bg-bg-mesh` |
| Cards | Glass/panel hierarchy via `GlassPanel`, `ShellPrimitives` |

---

## Strengths

- Cohesive dark DEX aesthetic
- Clear swap card hierarchy (from → to → quote → CTA)
- Loading skeletons match layout
- Token avatars (`SwapTokenAvatar`)
- Trust strip and homepage sections feel intentional
- Footer professional and not cluttered with fake metrics

---

## Polish gaps

| Issue | Severity |
|-------|----------|
| Reown modal visual mismatch with app theme | LOW (vendor) |
| Dual brand naming (Swaperex / Kobbex DEX) | MEDIUM |
| Dense swap card on small screens | MEDIUM |
| Secondary text contrast (`text-dark-400/500`) may fail WCAG AA on some backgrounds | MEDIUM |
| Empty states vary by module | LOW |

---

## Responsive behavior (source confirmed)

- Tailwind `sm:`, `lg:` breakpoints throughout
- Swap token row stacks on mobile
- Footer grid: 2 → 3 → 6 columns
- Below-fold content deferred for LCP

---

## Layout risks

| Check | Status |
|-------|--------|
| Layout shift on quote load | Partially mitigated with skeletons |
| Clipped long token names | `min-w-0` truncation used |
| Tiny tap targets | Mostly ≥44px on primary CTAs |
| Vendor modal overflow on mobile | **NOT CONFIRMED** live |

---

## Screenshot references

No screenshots captured in P14 (audit-only). Prior P10/P12 audits may contain visual baselines in `docs/audits/raw/`.

**Severity:** Documentation gap only — **OPTIONAL** capture in P16.
