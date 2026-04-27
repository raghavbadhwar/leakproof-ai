-- Optional invoice metadata used by finance reconciliation guardrails.
-- These columns are nullable so existing invoice CSVs keep working.

alter table public.invoice_records
  add column if not exists payment_terms_days integer,
  add column if not exists due_date date,
  add column if not exists paid_at date;

create index if not exists idx_invoice_payment_terms
  on public.invoice_records(workspace_id, payment_terms_days, due_date);
