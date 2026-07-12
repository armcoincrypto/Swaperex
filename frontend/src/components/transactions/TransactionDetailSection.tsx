import type { ReactNode } from 'react';
import type { DetailField } from '@/types/transactionDetails';

interface TransactionDetailSectionProps {
  title: string;
  fields: DetailField[];
  children?: ReactNode;
}

export function TransactionDetailSection({
  title,
  fields,
  children,
}: TransactionDetailSectionProps) {
  if (fields.length === 0 && !children) return null;

  return (
    <section className="space-y-2" aria-labelledby={`detail-section-${title.replace(/\s+/g, '-')}`}>
      <h4
        id={`detail-section-${title.replace(/\s+/g, '-')}`}
        className="text-xs font-semibold uppercase tracking-wide text-dark-400"
      >
        {title}
      </h4>
      {children}
      {fields.length > 0 && (
        <dl className="grid grid-cols-1 gap-2">
          {fields.map((field) => (
            <div key={`${title}-${field.label}`} className="min-w-0">
              <dt className="text-[11px] text-dark-500">{field.label}</dt>
              <dd
                className={`text-sm text-dark-100 break-all ${field.mono ? 'font-mono text-[12px]' : ''}`}
                title={field.hint ?? field.value}
              >
                {field.value}
              </dd>
              {field.hint && (
                <p className="text-[10px] text-dark-500 mt-0.5 leading-snug">{field.hint}</p>
              )}
              {field.accuracy && (
                <p className="text-[10px] text-dark-600 sr-only">{field.accuracy}</p>
              )}
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
