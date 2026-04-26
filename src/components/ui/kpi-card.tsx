type KpiCardTone = 'default' | 'good' | 'warning' | 'danger' | 'muted';

export function KpiCard({
  label,
  value,
  detail,
  tone = 'default'
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: KpiCardTone;
}) {
  return (
    <div className={`metric metric-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}
