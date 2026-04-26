-- Optional analytics metadata for premium dashboard and BI views.
-- These fields enrich reporting without changing deterministic leakage rules.

alter table public.audit_workspaces
  add column if not exists audit_period_start date,
  add column if not exists audit_period_end date;

alter table public.customers
  add column if not exists segment text,
  add column if not exists billing_model text,
  add column if not exists contract_type text,
  add column if not exists contract_value_minor bigint,
  add column if not exists currency text not null default 'USD',
  add column if not exists renewal_date date,
  add column if not exists owner_label text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.invoice_records
  add column if not exists billing_model text,
  add column if not exists product_label text,
  add column if not exists team_label text,
  add column if not exists service_period_start date,
  add column if not exists service_period_end date,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.usage_records
  add column if not exists product_label text,
  add column if not exists team_label text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists idx_customers_segment on public.customers(organization_id, segment);
create index if not exists idx_customers_billing_model on public.customers(organization_id, billing_model);
create index if not exists idx_customers_renewal_date on public.customers(organization_id, renewal_date);
create index if not exists idx_invoice_service_period on public.invoice_records(workspace_id, service_period_start, service_period_end);
create index if not exists idx_usage_product_team on public.usage_records(workspace_id, product_label, team_label);
