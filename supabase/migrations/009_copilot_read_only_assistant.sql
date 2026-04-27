-- Read-only Copilot assistant persistence.
-- Stores sanitized summaries and entity references only. Raw prompts, source text,
-- invoice contents, embeddings, and model outputs are intentionally not stored.

create table if not exists public.assistant_threads (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workspace_id uuid not null references public.audit_workspaces(id) on delete cascade,
  created_by uuid not null,
  title_safe_summary text not null,
  referenced_entities jsonb not null default '[]'::jsonb,
  status text not null default 'open' check (status in ('open', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.assistant_messages (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workspace_id uuid not null references public.audit_workspaces(id) on delete cascade,
  thread_id uuid not null references public.assistant_threads(id) on delete cascade,
  actor_user_id uuid,
  role text not null check (role in ('user', 'assistant', 'system')),
  safe_summary text not null,
  referenced_entities jsonb not null default '[]'::jsonb,
  ui_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.assistant_actions (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workspace_id uuid not null references public.audit_workspaces(id) on delete cascade,
  thread_id uuid references public.assistant_threads(id) on delete set null,
  message_id uuid references public.assistant_messages(id) on delete set null,
  action_type text not null check (action_type in (
    'prepare_run_extraction',
    'prepare_run_reconciliation',
    'prepare_search_evidence',
    'prepare_attach_evidence_candidate',
    'prepare_generate_report_draft',
    'prepare_update_finding_status',
    'prepare_approve_evidence',
    'prepare_assign_reviewer',
    'prepare_recovery_note'
  )),
  target_entity_type text not null,
  target_entity_id uuid,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'executed', 'cancelled', 'failed', 'expired')),
  risk_level text not null check (risk_level in ('low', 'medium', 'high', 'critical')),
  required_role text not null check (required_role in ('owner', 'admin', 'reviewer')),
  proposed_by uuid,
  confirmed_by uuid,
  cancelled_by uuid,
  executed_by uuid,
  idempotency_key text,
  payload_refs jsonb not null default '{}'::jsonb,
  preview jsonb not null default '{}'::jsonb,
  result_summary text,
  result_refs jsonb not null default '{}'::jsonb,
  failure_code text,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  executed_at timestamptz,
  expires_at timestamptz
);

alter table public.assistant_actions
  add column if not exists result_summary text,
  add column if not exists result_refs jsonb not null default '{}'::jsonb;

create table if not exists public.assistant_tool_calls (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workspace_id uuid not null references public.audit_workspaces(id) on delete cascade,
  thread_id uuid not null references public.assistant_threads(id) on delete cascade,
  assistant_message_id uuid not null references public.assistant_messages(id) on delete cascade,
  tool_name text not null,
  status text not null default 'completed' check (status in ('completed', 'failed')),
  input_refs jsonb not null default '{}'::jsonb,
  output_refs jsonb not null default '{}'::jsonb,
  result_summary text not null,
  error_summary text,
  created_at timestamptz not null default now()
);

alter table public.assistant_tool_calls
  add column if not exists error_summary text;

alter table public.assistant_threads enable row level security;
alter table public.assistant_messages enable row level security;
alter table public.assistant_actions enable row level security;
alter table public.assistant_tool_calls enable row level security;

drop policy if exists "org members can read assistant threads" on public.assistant_threads;
create policy "org members can read assistant threads" on public.assistant_threads
for select using (public.is_org_member(organization_id));

-- Assistant persistence is written only by server routes through the service
-- client after sanitization/redaction. Do not allow browser clients to insert
-- or update these rows directly, because direct writes could store raw prompts,
-- pasted contracts, invoice rows, or model output.
drop policy if exists "org members can insert assistant threads" on public.assistant_threads;
drop policy if exists "org members can update assistant threads" on public.assistant_threads;

drop policy if exists "org members can read assistant messages" on public.assistant_messages;
create policy "org members can read assistant messages" on public.assistant_messages
for select using (public.is_org_member(organization_id));

drop policy if exists "org members can insert assistant messages" on public.assistant_messages;

drop policy if exists "org members can read assistant actions" on public.assistant_actions;
create policy "org members can read assistant actions" on public.assistant_actions
for select using (public.is_org_member(organization_id));

drop policy if exists "review roles can insert assistant actions" on public.assistant_actions;
drop policy if exists "review roles can update assistant actions" on public.assistant_actions;

drop policy if exists "org members can read assistant tool calls" on public.assistant_tool_calls;
create policy "org members can read assistant tool calls" on public.assistant_tool_calls
for select using (public.is_org_member(organization_id));

drop policy if exists "org members can insert assistant tool calls" on public.assistant_tool_calls;

create index if not exists idx_assistant_threads_workspace
  on public.assistant_threads(organization_id, workspace_id, created_at desc);

create index if not exists idx_assistant_messages_thread
  on public.assistant_messages(thread_id, created_at);

create index if not exists idx_assistant_actions_workspace
  on public.assistant_actions(organization_id, workspace_id, status, created_at desc);

create unique index if not exists idx_assistant_actions_idempotency
  on public.assistant_actions(organization_id, workspace_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists idx_assistant_tool_calls_message
  on public.assistant_tool_calls(assistant_message_id, created_at);

create index if not exists idx_assistant_tool_calls_workspace
  on public.assistant_tool_calls(organization_id, workspace_id, tool_name, created_at desc);
