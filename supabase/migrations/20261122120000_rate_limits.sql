create table if not exists public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (key, window_start)
);

alter table public.rate_limits enable row level security;

revoke all on table public.rate_limits from anon, authenticated;
grant all on table public.rate_limits to service_role;

create or replace function public.check_rate_limit(
  p_key text,
  p_window_seconds integer,
  p_limit integer
)
returns table (
  allowed boolean,
  current_count integer,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_epoch double precision := extract(epoch from v_now);
  v_window_start timestamptz;
  v_new_count integer;
  v_allowed boolean;
  v_retry_after integer;
begin
  if random() < 0.01 then
    delete from public.rate_limits
    where window_start < v_now - interval '2 days';
  end if;

  v_window_start := to_timestamp(
    floor(v_epoch / p_window_seconds::double precision) * p_window_seconds::double precision
  );

  insert into public.rate_limits (key, window_start, count)
  values (p_key, v_window_start, 1)
  on conflict (key, window_start)
  do update set count = public.rate_limits.count + 1
  returning public.rate_limits.count into v_new_count;

  v_allowed := v_new_count <= p_limit;
  v_retry_after := greatest(
    0,
    ceil(
      extract(epoch from v_window_start)
      + p_window_seconds::double precision
      - v_epoch
    )::integer
  );

  return query
  select v_allowed, v_new_count, v_retry_after;
end;
$$;

revoke all on function public.check_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, integer, integer)
  to service_role;