-- Team invite workflow and reviewer assignment support.

create table if not exists public.organization_invites (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'reviewer', 'member', 'viewer')),
  token uuid not null unique default uuid_generate_v4(),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'cancelled', 'expired')),
  invited_by uuid not null,
  accepted_by uuid,
  accepted_at timestamptz,
  cancelled_at timestamptz,
  expires_at timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now()
);

alter table public.organization_invites enable row level security;

drop policy if exists "org members can read organization invites" on public.organization_invites;
create policy "org members can read organization invites" on public.organization_invites
for select using (public.is_org_member(organization_id));

drop policy if exists "owners and admins can manage organization invites" on public.organization_invites;
create policy "owners and admins can manage organization invites" on public.organization_invites
for all using (public.has_org_role(organization_id, array['owner', 'admin'])) with check (public.has_org_role(organization_id, array['owner', 'admin']));

create index if not exists idx_organization_invites_org_status on public.organization_invites(organization_id, status, created_at desc);
create index if not exists idx_organization_invites_token on public.organization_invites(token);
create index if not exists idx_findings_reviewer on public.leakage_findings(organization_id, reviewer_user_id, status);
