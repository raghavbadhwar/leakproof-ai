import type { ReactNode } from 'react';

export function ReportSection({
  title,
  detail,
  children
}: {
  title: string;
  detail?: string;
  children: ReactNode;
}) {
  return (
    <section className="report-section-block">
      <div>
        <h3>{title}</h3>
        {detail ? <p className="muted">{detail}</p> : null}
      </div>
      {children}
    </section>
  );
}
