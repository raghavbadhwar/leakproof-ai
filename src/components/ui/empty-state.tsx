import { FileBarChart } from 'lucide-react';

export function EmptyState({
  title,
  detail,
  compact = false
}: {
  title: string;
  detail: string;
  compact?: boolean;
}) {
  return (
    <div className={compact ? 'empty-state compact-empty' : 'empty-state'}>
      <FileBarChart size={compact ? 20 : 28} />
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
  );
}
