import type { ReactNode } from 'react';
import Link from 'next/link';

export type AppShellNavItem = {
  id: string;
  href: string;
  label: string;
  icon: ReactNode;
};

export function AppShell({
  navItems,
  activeSection,
  workspaceName,
  organizationName,
  userEmail,
  userRole,
  sidebarWorkspaceSelector,
  title,
  eyebrow,
  topbarControls,
  contextControls,
  copilotPanel,
  children
}: {
  navItems: AppShellNavItem[];
  activeSection: string;
  workspaceName: string;
  organizationName: string;
  userEmail: string;
  userRole: string;
  sidebarWorkspaceSelector: ReactNode;
  title: string;
  eyebrow: string;
  topbarControls: ReactNode;
  contextControls: ReactNode;
  copilotPanel?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className={copilotPanel ? 'audit-shell with-copilot' : 'audit-shell'}>
      <aside className="audit-sidebar">
        <div className="sidebar-brand">
          <span className="brand-mark">LP</span>
          <div>
            <h1>LeakProof</h1>
            <span>Revenue audit workspace</span>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Workspace pages">
          {navItems.map((item) => (
            <Link key={item.id} href={item.href} className={item.id === activeSection ? 'active' : undefined}>
              {item.icon}
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="sidebar-workspace">
          <span>Workspace</span>
          <strong>{workspaceName}</strong>
          <small>{organizationName}</small>
          {sidebarWorkspaceSelector}
        </div>

        <div className="sidebar-user">
          <span className="sidebar-avatar">{userEmail.slice(0, 1).toUpperCase()}</span>
          <div>
            <strong>{userEmail}</strong>
            <span>{organizationName}</span>
            <span className="role-badge">{userRole}</span>
          </div>
        </div>
      </aside>

      <section className="audit-main">
        <header className="workspace-header">
          <div className="page-title">
            <span>{eyebrow}</span>
            <h2>{title}</h2>
          </div>
          <div className="topbar-actions">
            {topbarControls}
          </div>
        </header>

        <div className="workspace-context">
          <div>
            <span>Organization</span>
            <strong>{organizationName}</strong>
          </div>
          <div>
            <span>Workspace</span>
            <strong>{workspaceName}</strong>
          </div>
          <div className="context-controls">
            {contextControls}
          </div>
        </div>

        {children}
      </section>
      {copilotPanel}
    </main>
  );
}
