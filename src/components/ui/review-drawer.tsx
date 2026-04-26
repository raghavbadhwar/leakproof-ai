import type { ReactNode } from 'react';

export function ReviewDrawer({
  title,
  detail,
  actions,
  children
}: {
  title: string;
  detail: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="review-drawer">
      <div>
        <h4>{title}</h4>
        <p>{detail}</p>
      </div>
      {children}
      {actions ? <div className="review-drawer-actions">{actions}</div> : null}
    </section>
  );
}
