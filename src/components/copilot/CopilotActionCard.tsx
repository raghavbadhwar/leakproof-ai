import Link from 'next/link';
import { ArrowRight, CheckCircle2, ShieldAlert, ShieldCheck, XCircle } from 'lucide-react';
import type { CopilotActionCardData } from './types';

export function CopilotActionCard({
  card,
  onConfirm,
  onCancel,
  isBusy
}: {
  card: CopilotActionCardData;
  onConfirm?: (actionId: string) => void;
  onCancel?: (actionId: string) => void;
  isBusy?: boolean;
}) {
  const className = `copilot-action-card copilot-card-${card.tone ?? 'default'}`;
  const action = card.pendingAction;
  if (action) {
    const hasBlockers = action.blockers.length > 0;
    const isPending = action.status === 'pending';
    return (
      <article className={`${className} copilot-confirmation-card`}>
        <div className="copilot-action-card-header">
          <span>{action.action_type.replaceAll('_', ' ')}</span>
          <strong>{action.title}</strong>
        </div>
        <div className="copilot-action-meta" aria-label="Action details">
          <span className={`risk-${action.risk_level}`}><ShieldAlert size={12} /> {action.risk_level}</span>
          <span>{action.required_role}+ role</span>
          <span>{action.status}</span>
        </div>
        <p>{action.description}</p>
        <div className="copilot-action-change-list">
          <span>What will change</span>
          {action.what_will_change.map((item) => <p key={item}>{item}</p>)}
        </div>
        {hasBlockers ? (
          <div className="copilot-action-blockers">
            <span>Blockers</span>
            {action.blockers.map((blocker) => <p key={blocker}>{blocker}</p>)}
          </div>
        ) : null}
        {action.status === 'confirmed' ? <small><CheckCircle2 size={13} /> Action confirmed.</small> : null}
        {action.status === 'executed' ? <small><CheckCircle2 size={13} /> {action.result_summary ?? 'Action executed.'}</small> : null}
        {action.status === 'failed' ? <small><XCircle size={13} /> {action.result_summary ?? 'Action failed safely.'}</small> : null}
        {action.status === 'cancelled' ? <small><XCircle size={13} /> Action cancelled.</small> : null}
        {isPending ? (
          <div className="copilot-action-buttons">
            <button type="button" onClick={() => onConfirm?.(action.id)} disabled={isBusy || hasBlockers}>
              <CheckCircle2 size={14} />
              Confirm
            </button>
            <button type="button" className="secondary-button" onClick={() => onCancel?.(action.id)} disabled={isBusy}>
              <XCircle size={14} />
              Cancel
            </button>
          </div>
        ) : null}
      </article>
    );
  }

  return (
    <article className={className}>
      <div>
        <span>{card.label ?? 'Read-only insight'}</span>
        <strong>{card.title}</strong>
      </div>
      {card.value ? <em>{card.value}</em> : null}
      {card.detail ? <p>{card.detail}</p> : null}
      {card.href ? (
        <Link href={card.href}>
          <ArrowRight size={14} />
          Open
        </Link>
      ) : (
        <small>
          <ShieldCheck size={13} />
          No action taken
        </small>
      )}
    </article>
  );
}
