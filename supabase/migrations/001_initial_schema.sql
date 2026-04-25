-- LeakProof AI initial schema
-- Designed for Supabase Postgres with Row-Level Security.

create extension if not exists "uuid-ossp";
create extension if not exists vector;

create table if not exists public.organizations (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null,
  role text not null check (role in ('owner', 'admin', 'reviewer', 'member', 'viewer')),
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table if not exists public.audit_workspaces (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'draft' check (status in ('draft', 'processing', 'ready', 'error', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customers (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  external_id text,
  name text not null,
  domain text,
  created_at timestamptz not null default now(),
  unique (organization_id, external_id)
);

create table if not exists public.source_documents (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workspace_id uuid not null references public.audit_workspaces(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  document_type text not null check (document_type in ('contract', 'invoice_csv', 'usage_csv', 'customer_csv', 'other')),
  file_name text not null,
  storage_path text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  parse_status text not null default 'pending' check (parse_status in ('pending', 'parsed', 'error')),
  extracted_text_status text not null default 'pending' check (extracted_text_status in ('pending', 'parsed', 'error', 'unsupported')),
  chunking_status text not null default 'pending' check (chunking_status in ('pending', 'chunked', 'error', 'unsupported')),
  embedding_status text not null default 'pending' check (embedding_status in ('pending', 'embedded', 'partial', 'error', 'unsupported')),
  parsed_text_path text,
  parse_error text,
  checksum_sha256 text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.document_chunks (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workspace_id uuid not null references public.audit_workspaces(id) on delete cascade,
  source_document_id uuid not null references public.source_documents(id) on delete cascade,
  chunk_index integer not null,
  modality text not null check (modality in ('text', 'pdf', 'image', 'csv_row', 'table', 'audio', 'video', 'mixed')),
  content text not null,
  source_label text not null,
  source_locator jsonb not null default '{}'::jsonb,
  content_hash text not null,
  token_estimate integer not null default 1,
  created_at timestamptz not null default now(),
  unique (source_document_id, content_hash)
);

create table if not exists public.ai_jobs (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workspace_id uuid references public.audit_workspaces(id) on delete cascade,
  source_document_id uuid references public.source_documents(id) on delete set null,
  job_type text not null check (job_type in ('extraction', 'embedding', 'report_draft', 'assistant')),
  provider text not null default 'gemini',
  model text not null,
  model_version text,
  prompt_version text,
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed')),
  error_message text,
  created_by uuid,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.embedding_jobs (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workspace_id uuid not null references public.audit_workspaces(id) on delete cascade,
  source_document_id uuid references public.source_documents(id) on delete cascade,
  provider text not null default 'gemini',
  model text not null,
  dimension integer not null check (dimension in (768, 1536, 3072)),
  task_type text not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed', 'partial')),
  chunks_total integer not null default 0,
  chunks_embedded integer not null default 0,
  error_message text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.document_embeddings (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workspace_id uuid not null references public.audit_workspaces(id) on delete cascade,
  source_document_id uuid not null references public.source_documents(id) on delete cascade,
  document_chunk_id uuid not null references public.document_chunks(id) on delete cascade,
  embedding_job_id uuid references public.embedding_jobs(id) on delete set null,
  provider text not null default 'gemini',
  model text not null,
  dimension integer not null default 1536 check (dimension = 1536),
  task_type text not null,
  content_hash text not null,
  embedding vector(1536) not null,
  created_at timestamptz not null default now(),
  unique (document_chunk_id, model, dimension, task_type, content_hash)
);

create table if not exists public.semantic_search_logs (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workspace_id uuid not null references public.audit_workspaces(id) on delete cascade,
  actor_user_id uuid,
  provider text not null default 'gemini',
  model text not null,
  dimension integer not null,
  query_hash text not null,
  result_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.contract_terms (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workspace_id uuid not null references public.audit_workspaces(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  source_document_id uuid not null references public.source_documents(id) on delete cascade,
  term_type text not null,
  term_value jsonb not null,
  original_term_value jsonb not null default '{}'::jsonb,
  citation jsonb not null,
  confidence numeric(5,4) not null check (confidence >= 0 and confidence <= 1),
  review_status text not null default 'extracted' check (review_status in ('extracted', 'approved', 'edited', 'needs_review', 'rejected')),
  provider text not null default 'gemini',
  model text,
  model_version text,
  prompt_version text,
  reviewer_user_id uuid,
  reviewer_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invoice_records (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workspace_id uuid not null references public.audit_workspaces(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  source_document_id uuid references public.source_documents(id) on delete set null,
  invoice_id text not null,
  invoice_date date not null,
  line_item text not null,
  quantity numeric(18,4),
  unit_price_minor bigint,
  amount_minor bigint not null,
  currency text not null default 'USD',
  row_citation jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.usage_records (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workspace_id uuid not null references public.audit_workspaces(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  source_document_id uuid references public.source_documents(id) on delete set null,
  period_start date not null,
  period_end date not null,
  metric_name text not null,
  quantity numeric(18,4) not null,
  row_citation jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.extraction_runs (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workspace_id uuid not null references public.audit_workspaces(id) on delete cascade,
  source_document_id uuid references public.source_documents(id) on delete cascade,
  ai_job_id uuid references public.ai_jobs(id) on delete set null,
  provider text not null default 'gemini',
  model text not null,
  model_version text,
  prompt_version text not null,
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  terms_created integer not null default 0,
  error_message text,
  created_by uuid,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.reconciliation_runs (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workspace_id uuid not null references public.audit_workspaces(id) on delete cascade,
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  findings_created integer not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  error_message text
);

create table if not exists public.leakage_findings (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workspace_id uuid not null references public.audit_workspaces(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  finding_type text not null,
  outcome_type text not null default 'recoverable_leakage' check (outcome_type in ('recoverable_leakage', 'prevented_future_leakage', 'risk_alert')),
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high', 'critical')),
  title text not null,
  summary text not null,
  detailed_explanation text,
  estimated_amount_minor bigint not null default 0,
  currency text not null default 'USD',
  confidence numeric(5,4) not null check (confidence >= 0 and confidence <= 1),
  status text not null default 'draft' check (status in ('draft', 'needs_review', 'approved', 'dismissed', 'customer_ready', 'recovered', 'not_recoverable')),
  evidence_coverage_status text not null default 'pending' check (evidence_coverage_status in ('pending', 'complete', 'weak', 'conflicting')),
  calculation jsonb not null,
  recommended_action text,
  reconciliation_run_id uuid references public.reconciliation_runs(id) on delete set null,
  reviewer_user_id uuid,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.evidence_items (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workspace_id uuid not null references public.audit_workspaces(id) on delete cascade,
  finding_id uuid not null references public.leakage_findings(id) on delete cascade,
  document_chunk_id uuid references public.document_chunks(id) on delete set null,
  evidence_type text not null check (evidence_type in ('contract_term', 'invoice_row', 'usage_row', 'calculation', 'supporting_document', 'human_note')),
  source_id uuid,
  citation jsonb not null,
  excerpt text,
  confidence numeric(5,4),
  relevance_explanation text,
  retrieval_score numeric(8,6),
  approval_state text not null default 'approved' check (approval_state in ('suggested', 'approved', 'rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.evidence_candidates (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workspace_id uuid not null references public.audit_workspaces(id) on delete cascade,
  finding_id uuid references public.leakage_findings(id) on delete cascade,
  contract_term_id uuid references public.contract_terms(id) on delete cascade,
  document_chunk_id uuid not null references public.document_chunks(id) on delete cascade,
  retrieval_score numeric(8,6) not null,
  relevance_explanation text,
  approval_state text not null default 'suggested' check (approval_state in ('suggested', 'approved', 'rejected')),
  attached_evidence_item_id uuid references public.evidence_items(id) on delete set null,
  reviewed_by uuid,
  review_note text,
  reviewed_at timestamptz,
  attached_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.evidence_packs (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workspace_id uuid not null references public.audit_workspaces(id) on delete cascade,
  title text not null,
  selected_finding_ids uuid[] not null default '{}',
  report_json jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'generated', 'exported')),
  generated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_events (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid references public.organizations(id) on delete cascade,
  actor_user_id uuid,
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Helper predicates for tenant and role-scoped policies.
create or replace function public.is_org_member(org_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = org_id
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.has_org_role(org_id uuid, allowed_roles text[])
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = org_id
      and m.user_id = auth.uid()
      and m.role = any(allowed_roles)
  );
$$;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.audit_workspaces enable row level security;
alter table public.customers enable row level security;
alter table public.source_documents enable row level security;
alter table public.document_chunks enable row level security;
alter table public.ai_jobs enable row level security;
alter table public.embedding_jobs enable row level security;
alter table public.document_embeddings enable row level security;
alter table public.semantic_search_logs enable row level security;
alter table public.contract_terms enable row level security;
alter table public.invoice_records enable row level security;
alter table public.usage_records enable row level security;
alter table public.extraction_runs enable row level security;
alter table public.reconciliation_runs enable row level security;
alter table public.leakage_findings enable row level security;
alter table public.evidence_items enable row level security;
alter table public.evidence_candidates enable row level security;
alter table public.evidence_packs enable row level security;
alter table public.audit_events enable row level security;

create policy "org members can read org" on public.organizations
for select using (public.is_org_member(id));

create policy "org members can read memberships" on public.organization_members
for select using (public.is_org_member(organization_id));

create policy "owners and admins can manage memberships" on public.organization_members
for all using (public.has_org_role(organization_id, array['owner', 'admin'])) with check (public.has_org_role(organization_id, array['owner', 'admin']));

create policy "org members can read workspaces" on public.audit_workspaces
for select using (public.is_org_member(organization_id));

create policy "org members can modify workspaces" on public.audit_workspaces
for all using (public.has_org_role(organization_id, array['owner', 'admin'])) with check (public.has_org_role(organization_id, array['owner', 'admin']));

create policy "org members can read customers" on public.customers
for select using (public.is_org_member(organization_id));

create policy "org members can modify customers" on public.customers
for all using (public.has_org_role(organization_id, array['owner', 'admin', 'reviewer'])) with check (public.has_org_role(organization_id, array['owner', 'admin', 'reviewer']));

create policy "org members can read source documents" on public.source_documents
for select using (public.is_org_member(organization_id));

create policy "org members can modify source documents" on public.source_documents
for all using (public.has_org_role(organization_id, array['owner', 'admin', 'reviewer'])) with check (public.has_org_role(organization_id, array['owner', 'admin', 'reviewer']));

create policy "org members can read document chunks" on public.document_chunks
for select using (public.is_org_member(organization_id));

create policy "org members can modify document chunks" on public.document_chunks
for all using (public.has_org_role(organization_id, array['owner', 'admin', 'reviewer'])) with check (public.has_org_role(organization_id, array['owner', 'admin', 'reviewer']));

create policy "org members can read ai jobs" on public.ai_jobs
for select using (public.is_org_member(organization_id));

create policy "org members can modify ai jobs" on public.ai_jobs
for all using (public.has_org_role(organization_id, array['owner', 'admin', 'reviewer'])) with check (public.has_org_role(organization_id, array['owner', 'admin', 'reviewer']));

create policy "org members can read embedding jobs" on public.embedding_jobs
for select using (public.is_org_member(organization_id));

create policy "org members can modify embedding jobs" on public.embedding_jobs
for all using (public.has_org_role(organization_id, array['owner', 'admin', 'reviewer'])) with check (public.has_org_role(organization_id, array['owner', 'admin', 'reviewer']));

create policy "org members can read document embeddings" on public.document_embeddings
for select using (public.is_org_member(organization_id));

create policy "org members can modify document embeddings" on public.document_embeddings
for all using (public.has_org_role(organization_id, array['owner', 'admin', 'reviewer'])) with check (public.has_org_role(organization_id, array['owner', 'admin', 'reviewer']));

create policy "org members can read semantic search logs" on public.semantic_search_logs
for select using (public.is_org_member(organization_id));

create policy "org members can modify semantic search logs" on public.semantic_search_logs
for all using (public.has_org_role(organization_id, array['owner', 'admin', 'reviewer'])) with check (public.has_org_role(organization_id, array['owner', 'admin', 'reviewer']));

create policy "org members can read contract terms" on public.contract_terms
for select using (public.is_org_member(organization_id));

create policy "org members can modify contract terms" on public.contract_terms
for all using (public.has_org_role(organization_id, array['owner', 'admin', 'reviewer'])) with check (public.has_org_role(organization_id, array['owner', 'admin', 'reviewer']));

create policy "org members can read invoice records" on public.invoice_records
for select using (public.is_org_member(organization_id));

create policy "org members can modify invoice records" on public.invoice_records
for all using (public.has_org_role(organization_id, array['owner', 'admin', 'reviewer'])) with check (public.has_org_role(organization_id, array['owner', 'admin', 'reviewer']));

create policy "org members can read usage records" on public.usage_records
for select using (public.is_org_member(organization_id));

create policy "org members can modify usage records" on public.usage_records
for all using (public.has_org_role(organization_id, array['owner', 'admin', 'reviewer'])) with check (public.has_org_role(organization_id, array['owner', 'admin', 'reviewer']));

create policy "org members can read extraction runs" on public.extraction_runs
for select using (public.is_org_member(organization_id));

create policy "org members can modify extraction runs" on public.extraction_runs
for all using (public.has_org_role(organization_id, array['owner', 'admin', 'reviewer'])) with check (public.has_org_role(organization_id, array['owner', 'admin', 'reviewer']));

create policy "org members can read reconciliation runs" on public.reconciliation_runs
for select using (public.is_org_member(organization_id));

create policy "org members can modify reconciliation runs" on public.reconciliation_runs
for all using (public.has_org_role(organization_id, array['owner', 'admin', 'reviewer'])) with check (public.has_org_role(organization_id, array['owner', 'admin', 'reviewer']));

create policy "org members can read leakage findings" on public.leakage_findings
for select using (public.is_org_member(organization_id));

create policy "org members can modify leakage findings" on public.leakage_findings
for all using (public.has_org_role(organization_id, array['owner', 'admin', 'reviewer'])) with check (public.has_org_role(organization_id, array['owner', 'admin', 'reviewer']));

create policy "org members can read evidence" on public.evidence_items
for select using (public.is_org_member(organization_id));

create policy "org members can modify evidence" on public.evidence_items
for all using (public.has_org_role(organization_id, array['owner', 'admin', 'reviewer'])) with check (public.has_org_role(organization_id, array['owner', 'admin', 'reviewer']));

create policy "org members can read evidence candidates" on public.evidence_candidates
for select using (public.is_org_member(organization_id));

create policy "org members can modify evidence candidates" on public.evidence_candidates
for all using (public.has_org_role(organization_id, array['owner', 'admin', 'reviewer'])) with check (public.has_org_role(organization_id, array['owner', 'admin', 'reviewer']));

create policy "org members can read evidence packs" on public.evidence_packs
for select using (public.is_org_member(organization_id));

create policy "org members can modify evidence packs" on public.evidence_packs
for all using (public.has_org_role(organization_id, array['owner', 'admin', 'reviewer'])) with check (public.has_org_role(organization_id, array['owner', 'admin', 'reviewer']));

create policy "org members can read audit events" on public.audit_events
for select using (organization_id is null or public.is_org_member(organization_id));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'source-documents',
  'source-documents',
  false,
  26214400,
  array[
	    'application/pdf',
	    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	    'text/plain',
	    'image/png',
	    'image/jpeg',
	    'text/csv',
    'application/csv',
    'application/vnd.ms-excel'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "org members can read source document objects" on storage.objects
for select using (
  bucket_id = 'source-documents'
  and (storage.foldername(name))[1] = 'org'
  and public.is_org_member(((storage.foldername(name))[2])::uuid)
);

create policy "org members can upload source document objects" on storage.objects
for insert with check (
  bucket_id = 'source-documents'
  and (storage.foldername(name))[1] = 'org'
  and public.has_org_role(((storage.foldername(name))[2])::uuid, array['owner', 'admin', 'reviewer'])
);

create or replace function public.match_document_chunks(
  query_embedding vector(1536),
  match_organization_id uuid,
  match_workspace_id uuid,
  match_count integer default 8
)
returns table (
  chunk_id uuid,
  source_document_id uuid,
  source_label text,
  content text,
  similarity double precision
)
language sql
security definer
set search_path = public
as $$
  select
    c.id as chunk_id,
    c.source_document_id,
    c.source_label,
    c.content,
    1 - (e.embedding <=> query_embedding) as similarity
  from public.document_embeddings e
  join public.document_chunks c on c.id = e.document_chunk_id
  where e.organization_id = match_organization_id
    and e.workspace_id = match_workspace_id
    and c.organization_id = match_organization_id
    and c.workspace_id = match_workspace_id
    and public.is_org_member(match_organization_id)
  order by e.embedding <=> query_embedding
  limit match_count;
$$;

create index if not exists idx_workspaces_org on public.audit_workspaces(organization_id);
create index if not exists idx_documents_workspace on public.source_documents(workspace_id);
create index if not exists idx_chunks_workspace on public.document_chunks(workspace_id);
create index if not exists idx_chunks_document on public.document_chunks(source_document_id);
create index if not exists idx_embeddings_workspace on public.document_embeddings(workspace_id);
create index if not exists idx_embeddings_vector on public.document_embeddings using ivfflat (embedding vector_cosine_ops) with (lists = 100);
create index if not exists idx_embedding_jobs_workspace on public.embedding_jobs(workspace_id);
create index if not exists idx_ai_jobs_workspace on public.ai_jobs(workspace_id);
create index if not exists idx_semantic_search_workspace on public.semantic_search_logs(workspace_id, created_at desc);
create index if not exists idx_extraction_runs_workspace on public.extraction_runs(workspace_id);
create index if not exists idx_reconciliation_runs_workspace on public.reconciliation_runs(workspace_id);
create index if not exists idx_terms_workspace on public.contract_terms(workspace_id);
create index if not exists idx_invoice_workspace on public.invoice_records(workspace_id);
create index if not exists idx_usage_workspace on public.usage_records(workspace_id);
create index if not exists idx_findings_workspace on public.leakage_findings(workspace_id);
create index if not exists idx_evidence_workspace on public.evidence_items(workspace_id);
create index if not exists idx_evidence_finding on public.evidence_items(finding_id);
create index if not exists idx_evidence_candidates_finding on public.evidence_candidates(finding_id);
create index if not exists idx_evidence_packs_workspace on public.evidence_packs(workspace_id);
create index if not exists idx_audit_events_org_time on public.audit_events(organization_id, created_at desc);
