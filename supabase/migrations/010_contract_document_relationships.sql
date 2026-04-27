-- Advisory contract hierarchy relationships.
-- Stores safe relationship references only; raw contracts, prompts, full model
-- outputs, embeddings, and customer PII are intentionally not stored here.

-- Keep the assistant action constraint aligned with Copilot's executable action
-- registry so hierarchy-resolution actions can be queued for human confirmation.
alter table public.assistant_actions
  drop constraint if exists assistant_actions_action_type_check;

alter table public.assistant_actions
  add constraint assistant_actions_action_type_check check (action_type in (
    'prepare_run_extraction',
    'prepare_run_reconciliation',
    'prepare_search_evidence',
    'prepare_attach_evidence_candidate',
    'prepare_generate_report_draft',
    'prepare_update_finding_status',
    'prepare_approve_evidence',
    'prepare_assign_reviewer',
    'prepare_recovery_note',
    'prepare_contract_hierarchy_resolution'
  ));

create table if not exists public.contract_document_relationships (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workspace_id uuid not null references public.audit_workspaces(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  source_document_id uuid not null references public.source_documents(id) on delete cascade,
  related_source_document_id uuid not null references public.source_documents(id) on delete cascade,
  relationship_type text not null check (relationship_type in (
    'supersedes',
    'amends',
    'renews',
    'incorporates',
    'references',
    'conflicts_with'
  )),
  effective_date date,
  confidence numeric(5,4) not null check (confidence >= 0 and confidence <= 1),
  citation jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (source_document_id <> related_source_document_id)
);

alter table public.contract_document_relationships enable row level security;

drop policy if exists "org members can read contract document relationships" on public.contract_document_relationships;
create policy "org members can read contract document relationships" on public.contract_document_relationships
for select using (public.is_org_member(organization_id));

drop policy if exists "reviewers can modify contract document relationships" on public.contract_document_relationships;
create policy "reviewers can modify contract document relationships" on public.contract_document_relationships
for all using (public.has_org_role(organization_id, array['owner', 'admin', 'reviewer']))
with check (public.has_org_role(organization_id, array['owner', 'admin', 'reviewer']));

create index if not exists idx_contract_doc_relationships_workspace
  on public.contract_document_relationships(organization_id, workspace_id, customer_id, created_at desc);

create index if not exists idx_contract_doc_relationships_source
  on public.contract_document_relationships(source_document_id, relationship_type);

create unique index if not exists idx_contract_doc_relationships_unique_current
  on public.contract_document_relationships(
    organization_id,
    workspace_id,
    coalesce(customer_id, '00000000-0000-0000-0000-000000000000'::uuid),
    source_document_id,
    related_source_document_id,
    relationship_type,
    coalesce(effective_date, '0001-01-01'::date)
  );
