-- Evidence approval hardening.
-- System-created evidence must not be export-ready until a reviewer approves it.

alter table public.evidence_items
  alter column approval_state set default 'suggested';

update public.evidence_items
set approval_state = 'suggested'
where approval_state = 'approved'
  and (reviewed_by is null or reviewed_at is null);

create index if not exists idx_evidence_items_export_ready
  on public.evidence_items(workspace_id, finding_id, approval_state, reviewed_by, reviewed_at)
  where approval_state = 'approved';
