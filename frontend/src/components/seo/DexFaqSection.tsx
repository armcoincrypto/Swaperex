/**
 * P4 — Landing FAQ; copy is shared with JSON-LD FAQPage via `kobbexDexLandingFaq`.
 */

import { KOBBEX_DEX_LANDING_FAQ } from '@/constants/kobbexDexLandingFaq';

export function DexFaqSection() {
  return (
    <section className="mt-6" aria-labelledby="kobbex-dex-faq-heading">
      <h2 id="kobbex-dex-faq-heading" className="text-sm font-semibold text-white mb-3">
        Common questions
      </h2>
      <div className="space-y-2 max-w-3xl mx-auto">
        {KOBBEX_DEX_LANDING_FAQ.map((item) => (
          <details
            key={item.question}
            className="group rounded-lg border border-white/[0.06] bg-dark-900/40 px-3 py-2"
          >
            <summary className="cursor-pointer text-sm font-medium text-dark-200 list-none flex items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
              <span>{item.question}</span>
              <span className="text-dark-500 text-xs shrink-0 group-open:rotate-180 transition-transform">
                ▾
              </span>
            </summary>
            <p className="mt-2 text-sm text-dark-400 leading-relaxed pl-0.5">{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
