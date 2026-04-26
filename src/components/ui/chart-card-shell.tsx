import type { ReactNode } from 'react';

type ChartScope = 'Customer-facing leakage' | 'Internal pipeline' | 'Needs finance review';

export function ChartCardShell({
  title,
  scope,
  children
}: {
  title: string;
  scope: ChartScope;
  children: ReactNode;
}) {
  return (
    <section className="chart-card">
      <div className="chart-card-header">
        <div>
          <h3>{title}</h3>
          <p>{scope === 'Customer-facing leakage' ? 'Approved/customer-ready/recovered only.' : scope === 'Internal pipeline' ? 'Internal operational data, not customer-facing leakage.' : 'Review workflow data for finance operators.'}</p>
        </div>
        <span className={`scope-chip ${scope === 'Customer-facing leakage' ? 'scope-approved' : scope === 'Internal pipeline' ? 'scope-internal' : 'scope-review'}`}>
          {scope}
        </span>
      </div>
      {children}
    </section>
  );
}
