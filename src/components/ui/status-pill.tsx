type StatusPillTone = 'good' | 'warning' | 'danger' | 'muted';

export function StatusPill({ value, tone }: { value: string; tone?: StatusPillTone }) {
  const normalized = value.toLowerCase().replaceAll(' ', '_');
  const inferredTone = tone ?? (
    ['approved', 'customer_ready', 'recovered', 'complete', 'ready', 'linked', 'good'].includes(normalized)
      ? 'good'
      : ['draft', 'needs_review', 'in_review', 'needed', 'open', 'review'].includes(normalized)
        ? 'warning'
        : ['dismissed', 'rejected', 'not_recoverable'].includes(normalized)
          ? 'danger'
          : 'muted'
  );

  return <span className={`status-badge status-${inferredTone}`}>{value.replaceAll('_', ' ')}</span>;
}
