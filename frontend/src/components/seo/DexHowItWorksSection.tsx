/**
 * P4 — Short “how it works” steps on the landing surface (below swap).
 */

const steps = [
  { title: 'Connect', body: 'Use a wallet you control on a supported network.' },
  { title: 'Review quote', body: 'Pick tokens and an amount; check the preview before signing.' },
  { title: 'Sign', body: 'Approve or swap only if the wallet details match what you expect.' },
] as const;

export function DexHowItWorksSection() {
  return (
    <section
      className="mt-6"
      aria-labelledby="kobbex-dex-how-heading"
    >
      <div className="rounded-xl border border-white/[0.08] bg-electro-panel/20 px-4 py-4 sm:px-5">
        <h2 id="kobbex-dex-how-heading" className="text-sm font-semibold text-white mb-3">
          How Kobbex DEX fits your flow
        </h2>
        <ol className="grid gap-3 sm:grid-cols-3 sm:gap-4">
          {steps.map((s, i) => (
            <li key={s.title} className="flex gap-3 text-sm text-dark-300">
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/[0.1] bg-dark-900/50 text-xs font-bold text-dark-200"
                aria-hidden
              >
                {i + 1}
              </span>
              <span>
                <span className="font-medium text-dark-200">{s.title}. </span>
                {s.body}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
