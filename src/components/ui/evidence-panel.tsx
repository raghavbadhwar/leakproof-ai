import type { ReactNode } from 'react';

export function EvidencePanel({
  title,
  detail,
  children
}: {
  title: string;
  detail?: string;
  children: ReactNode;
}) {
  return (
    <article className="detail-card evidence-panel">
      <h4>{title}</h4>
      {detail ? <p className="muted">{detail}</p> : null}
      {children}
    </article>
  );
}
