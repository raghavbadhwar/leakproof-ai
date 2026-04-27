import type { ReactNode } from 'react';

type ChartScope = 'Customer-facing leakage' | 'Internal pipeline' | 'Needs finance review';

export function ChartCardShell({
  title,
  scope,
  children
}: {
  title: string;
  scope: ChartScope | string;
  children: ReactNode;
}) {
  return (
    <section className="chart-card">
      <div className="chart-card-header">
        <div>
          <h3>{title}</h3>
          <p>{scopeDescription(scope)}</p>
        </div>
        <span className={`scope-chip ${scopeClassName(scope)}`}>
          {scope}
        </span>
      </div>
      {children}
    </section>
  );
}

function scopeDescription(scope: string): string {
  if (scope === 'Customer-facing leakage') return 'Approved/customer-ready/recovered only.';
  if (scope === 'Internal pipeline') return 'Internal operational data, not customer-facing leakage.';
  if (scope === 'Needs finance review') return 'Review workflow data for finance operators.';
  if (/root|prevention|advisory|control/i.test(scope)) return 'Advisory operating insight; financial totals still come from deterministic findings.';
  return 'Workspace analytics with customer-facing and internal views kept separate.';
}

function scopeClassName(scope: string): string {
  if (scope === 'Customer-facing leakage') return 'scope-approved';
  if (scope === 'Internal pipeline') return 'scope-internal';
  if (scope === 'Needs finance review') return 'scope-review';
  return 'scope-internal';
}
