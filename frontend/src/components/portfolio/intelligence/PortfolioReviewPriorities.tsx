import type { ReviewPriority } from './portfolioIntelligenceModel';
import { ShellPanel } from '@/components/ui/ShellPrimitives';

interface Props {
  priorities: ReviewPriority[];
}

function severityClasses(severity: ReviewPriority['severity']): string {
  switch (severity) {
    case 'review':
      return 'border-amber-800/35 bg-amber-950/20';
    case 'attention':
      return 'border-yellow-800/30 bg-yellow-950/15';
    default:
      return 'border-white/[0.06] bg-black/15';
  }
}

function severityDot(severity: ReviewPriority['severity']): string {
  switch (severity) {
    case 'review':
      return 'bg-amber-400';
    case 'attention':
      return 'bg-yellow-400';
    default:
      return 'bg-accent/70';
  }
}

export function PortfolioReviewPriorities({ priorities }: Props) {
  return (
    <ShellPanel className="p-3 sm:p-4">
      <p className="text-[10px] uppercase tracking-wider text-dark-500 mb-0.5">
        Review Priorities
      </p>
      <p className="text-[10px] text-dark-500 mb-2.5 leading-snug">
        Derived from balance distribution and local Radar state — not financial advice
      </p>
      <ul className="space-y-1.5">
        {priorities.map((item) => (
          <li
            key={item.id}
            className={`rounded-lg border px-2.5 py-2 ${severityClasses(item.severity)}`}
          >
            <div className="flex items-start gap-2">
              <span
                className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${severityDot(item.severity)}`}
                aria-hidden
              />
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-dark-200">{item.label}</p>
                <p className="text-[10px] text-dark-500 mt-0.5 leading-snug">{item.detail}</p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </ShellPanel>
  );
}
