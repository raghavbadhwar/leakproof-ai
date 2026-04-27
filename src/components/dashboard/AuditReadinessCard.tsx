'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, ClipboardList, Loader2 } from 'lucide-react';
import type { AuditReadinessPayload, ReadinessIssue } from '@/lib/ai/auditReadiness';

export function AuditReadinessCard({
  readiness,
  isBusy = false
}: {
  readiness: AuditReadinessPayload | null;
  isBusy?: boolean;
}) {
  if (!readiness) {
    return (
      <div className="dashboard-card readiness-card audit-readiness-card">
        <div className="dashboard-card-header">
          <h3>Audit readiness</h3>
        </div>
        <div className="audit-readiness-loading">
          <Loader2 className="spin" size={18} />
          <span>Checking workspace readiness...</span>
        </div>
      </div>
    );
  }

  const blockerCount = readiness.blockers.length;
  const warningCount = readiness.warnings.length;
  const queueItems = [...readiness.blockers, ...readiness.warnings].slice(0, 4);
  const scoreTone = readiness.readinessScore >= 90 ? 'good' : readiness.readinessScore >= 60 ? 'warning' : 'danger';

  return (
    <div className="dashboard-card readiness-card audit-readiness-card">
      <div className="dashboard-card-header">
        <h3>Audit readiness</h3>
        <span className={`readiness-score ${scoreTone}`}>{readiness.readinessScore}</span>
      </div>

      <div className="audit-readiness-phase">
        <span>Current phase</span>
        <strong>{labelize(readiness.readinessLabel)}</strong>
      </div>

      <div className="audit-readiness-meter" aria-label={`Audit readiness score ${readiness.readinessScore} out of 100`}>
        <span style={{ width: `${readiness.readinessScore}%` }} />
      </div>

      <div className="readiness-list compact">
        <ReadinessCount
          icon={blockerCount > 0 ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
          label="Blockers"
          value={blockerCount === 0 ? 'None' : String(blockerCount)}
          tone={blockerCount > 0 ? 'danger' : 'good'}
        />
        <ReadinessCount
          icon={<ClipboardList size={16} />}
          label="Warnings"
          value={warningCount === 0 ? 'None' : String(warningCount)}
          tone={warningCount > 0 ? 'warning' : 'muted'}
        />
      </div>

      <div className="review-queue-shortcut">
        <div>
          <strong>{blockerCount > 0 ? `Fix ${blockerCount} blocker${blockerCount === 1 ? '' : 's'}` : 'Review queue clear'}</strong>
          <span>{readiness.nextBestAction.title}</span>
        </div>
        <Link className="button-link secondary" href={readiness.nextBestAction.deepLink}>
          {readiness.nextBestAction.ctaLabel} <ArrowRight size={15} />
        </Link>
      </div>

      {queueItems.length > 0 ? (
        <div className="readiness-blocker-list">
          {queueItems.map((item) => (
            <IssueLink key={`${item.category}-${item.title}`} item={item} />
          ))}
        </div>
      ) : (
        <p className="readiness-clear-copy">
          Required data, review states, and evidence gates are ready for report generation.
        </p>
      )}

      {isBusy ? (
        <div className="audit-readiness-refreshing">
          <Loader2 className="spin" size={14} /> Refreshing
        </div>
      ) : null}
    </div>
  );
}

function ReadinessCount({
  icon,
  label,
  value,
  tone
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone: 'good' | 'warning' | 'danger' | 'muted';
}) {
  return (
    <div className={`readiness-row readiness-count ${tone}`}>
      <span>{icon} {label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function IssueLink({ item }: { item: ReadinessIssue }) {
  return (
    <Link className={`readiness-issue-link ${item.severity}`} href={item.deepLink}>
      <span>{item.title}</span>
      <small>{item.recommendedAction}</small>
    </Link>
  );
}

function labelize(value: string): string {
  return value
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}
