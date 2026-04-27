import { FileBarChart } from 'lucide-react';
import Link from 'next/link';

export function EmptyState({
  title,
  detail,
  compact = false,
  actionHref,
  actionLabel
}: {
  title: string;
  detail: string;
  compact?: boolean;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className={compact ? 'empty-state compact-empty' : 'empty-state'}>
      <FileBarChart size={compact ? 20 : 28} />
      <strong>{title}</strong>
      <p>{detail}</p>
      {actionHref && actionLabel ? <Link className="button-link secondary empty-state-action" href={actionHref}>{actionLabel}</Link> : null}
    </div>
  );
}
