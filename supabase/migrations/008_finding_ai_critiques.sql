-- Advisory AI finding critiques.
-- Critiques are separate from deterministic finding amount and human review status.

create table if not exists public.finding_ai_critiques (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workspace_id uuid not null references public.audit_workspaces(id) on delete cascade,
  finding_id uuid not null references public.leakage_findings(id) on delete cascade,
  recommendation_status text not null check (recommendation_status in ('strong_evidence', 'weak_evidence', 'conflicting_evidence', 'needs_more_evidence')),
  evidence_score integer not null check (evidence_score >= 0 and evidence_score <= 100),
  critique_json jsonb not null,
  input_fingerprint text not null,
  provider text not null default 'gemini',
  model text not null,
  model_version text,
  prompt_version text not null,
  generated_by uuid not null,
  created_at timestamptz not null default now()
);

alter table public.finding_ai_critiques enable row level security;

create policy "org members can read finding ai critiques" on public.finding_ai_critiques
for select using (public.is_org_member(organization_id));

create policy "reviewers can create finding ai critiques" on public.finding_ai_critiques
for insert with check (public.has_org_role(organization_id, array['owner', 'admin', 'reviewer']));

create index if not exists idx_finding_ai_critiques_latest
  on public.finding_ai_critiques(organization_id, workspace_id, finding_id, created_at desc);
