-- Shared API rate-limit buckets for multi-instance production deployments.
-- The app stores only SHA-256 hashes of limiter keys.

create table if not exists public.api_rate_limit_buckets (
  key_hash text primary key,
  request_count integer not null default 0 check (request_count >= 0),
  reset_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.api_rate_limit_buckets enable row level security;

revoke all on table public.api_rate_limit_buckets from anon, authenticated;
grant select, insert, update, delete on table public.api_rate_limit_buckets to service_role;

create or replace function public.consume_api_rate_limit(
  p_key_hash text,
  p_limit integer,
  p_window_ms integer,
  p_now timestamptz default now()
)
returns table(allowed boolean, remaining integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_reset_at timestamptz;
begin
  if p_key_hash is null or length(trim(p_key_hash)) = 0 or p_limit < 1 or p_window_ms < 1 then
    raise exception 'invalid_rate_limit_input';
  end if;

  insert into public.api_rate_limit_buckets as bucket (
    key_hash,
    request_count,
    reset_at,
    created_at,
    updated_at
  )
  values (
    p_key_hash,
    1,
    p_now + (p_window_ms * interval '1 millisecond'),
    p_now,
    p_now
  )
  on conflict (key_hash) do update
  set
    request_count = case
      when bucket.reset_at <= p_now then 1
      else bucket.request_count + 1
    end,
    reset_at = case
      when bucket.reset_at <= p_now then p_now + (p_window_ms * interval '1 millisecond')
      else bucket.reset_at
    end,
    updated_at = p_now
  returning bucket.request_count, bucket.reset_at into v_count, v_reset_at;

  return query
    select
      v_count <= p_limit as allowed,
      greatest(p_limit - v_count, 0) as remaining,
      v_reset_at as reset_at;
end;
$$;

revoke all on function public.consume_api_rate_limit(text, integer, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit(text, integer, integer, timestamptz) to service_role;
