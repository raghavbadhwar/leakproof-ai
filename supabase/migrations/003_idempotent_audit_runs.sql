-- Idempotent audit reruns.
-- New extraction/reconciliation output is staged first, then atomically promoted.

update public.extraction_runs
set status = 'processing'
where status = 'running';

update public.reconciliation_runs
set status = 'processing'
where status = 'running';

alter table public.extraction_runs
  drop constraint if exists extraction_runs_status_check;

alter table public.extraction_runs
  add column if not exists run_version integer not null default 1,
  add column if not exists superseded_by_run_id uuid references public.extraction_runs(id) on delete set null,
  add column if not exists superseded_at timestamptz,
  add column if not exists started_at timestamptz,
  add constraint extraction_runs_status_check
    check (status in ('queued', 'processing', 'completed', 'failed', 'superseded'));

alter table public.reconciliation_runs
  drop constraint if exists reconciliation_runs_status_check;

alter table public.reconciliation_runs
  add column if not exists run_version integer not null default 1,
  add column if not exists superseded_by_run_id uuid references public.reconciliation_runs(id) on delete set null,
  add column if not exists superseded_at timestamptz,
  add column if not exists started_at timestamptz,
  add constraint reconciliation_runs_status_check
    check (status in ('queued', 'processing', 'completed', 'failed', 'superseded'));

alter table public.contract_terms
  add column if not exists extraction_run_id uuid references public.extraction_runs(id) on delete set null,
  add column if not exists is_active boolean not null default true,
  add column if not exists superseded_by_run_id uuid references public.extraction_runs(id) on delete set null,
  add column if not exists superseded_at timestamptz,
  add column if not exists logical_key text;

alter table public.leakage_findings
  add column if not exists is_active boolean not null default true,
  add column if not exists superseded_by_run_id uuid references public.reconciliation_runs(id) on delete set null,
  add column if not exists superseded_at timestamptz,
  add column if not exists logical_key text,
  add column if not exists period_start date,
  add column if not exists period_end date;

create index if not exists idx_extraction_runs_latest
  on public.extraction_runs(workspace_id, source_document_id, status, created_at desc);

create index if not exists idx_reconciliation_runs_latest
  on public.reconciliation_runs(workspace_id, status, created_at desc);

create index if not exists idx_terms_active_workspace
  on public.contract_terms(workspace_id, is_active, review_status);

create index if not exists idx_findings_active_workspace
  on public.leakage_findings(workspace_id, is_active, status);

create unique index if not exists idx_contract_terms_active_logical
  on public.contract_terms(
    workspace_id,
    source_document_id,
    coalesce(customer_id, '00000000-0000-0000-0000-000000000000'::uuid),
    term_type,
    logical_key
  )
  where is_active and logical_key is not null;

create unique index if not exists idx_leakage_findings_active_logical
  on public.leakage_findings(
    workspace_id,
    coalesce(customer_id, '00000000-0000-0000-0000-000000000000'::uuid),
    finding_type,
    coalesce(period_start, '0001-01-01'::date),
    coalesce(period_end, '9999-12-31'::date),
    logical_key
  )
  where is_active and logical_key is not null;

create or replace function public.complete_extraction_run(
  p_run_id uuid,
  p_organization_id uuid,
  p_workspace_id uuid,
  p_source_document_id uuid,
  p_terms_created integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.contract_terms
  set is_active = false,
      superseded_by_run_id = p_run_id,
      superseded_at = now(),
      updated_at = now()
  where organization_id = p_organization_id
    and workspace_id = p_workspace_id
    and source_document_id = p_source_document_id
    and is_active = true
    and (extraction_run_id is null or extraction_run_id <> p_run_id);

  update public.contract_terms
  set is_active = true,
      superseded_by_run_id = null,
      superseded_at = null,
      updated_at = now()
  where organization_id = p_organization_id
    and workspace_id = p_workspace_id
    and source_document_id = p_source_document_id
    and extraction_run_id = p_run_id;

  update public.extraction_runs
  set status = 'superseded',
      superseded_by_run_id = p_run_id,
      superseded_at = now()
  where organization_id = p_organization_id
    and workspace_id = p_workspace_id
    and source_document_id = p_source_document_id
    and id <> p_run_id
    and status = 'completed';

  update public.extraction_runs
  set status = 'completed',
      terms_created = p_terms_created,
      completed_at = now(),
      error_message = null
  where id = p_run_id
    and organization_id = p_organization_id
    and workspace_id = p_workspace_id
    and source_document_id = p_source_document_id;
end;
$$;

create or replace function public.complete_reconciliation_run(
  p_run_id uuid,
  p_organization_id uuid,
  p_workspace_id uuid,
  p_findings_created integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.leakage_findings
  set is_active = false,
      superseded_by_run_id = p_run_id,
      superseded_at = now(),
      updated_at = now()
  where organization_id = p_organization_id
    and workspace_id = p_workspace_id
    and is_active = true
    and (reconciliation_run_id is null or reconciliation_run_id <> p_run_id);

  update public.leakage_findings
  set is_active = true,
      superseded_by_run_id = null,
      superseded_at = null,
      updated_at = now()
  where organization_id = p_organization_id
    and workspace_id = p_workspace_id
    and reconciliation_run_id = p_run_id;

  update public.reconciliation_runs
  set status = 'superseded',
      superseded_by_run_id = p_run_id,
      superseded_at = now()
  where organization_id = p_organization_id
    and workspace_id = p_workspace_id
    and id <> p_run_id
    and status = 'completed';

  update public.reconciliation_runs
  set status = 'completed',
      findings_created = p_findings_created,
      completed_at = now(),
      error_message = null
  where id = p_run_id
    and organization_id = p_organization_id
    and workspace_id = p_workspace_id;
end;
$$;
