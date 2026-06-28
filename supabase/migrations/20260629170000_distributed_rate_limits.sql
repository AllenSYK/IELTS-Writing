-- 分布式限流表和 RPC
-- 使用 PostgreSQL 原子操作实现跨实例限流

create table if not exists public.rate_limits (
  key text not null,
  window_started_at timestamptz not null,
  count integer not null default 1,
  primary key (key, window_started_at)
);

create index if not exists idx_rate_limits_key_window on public.rate_limits(key, window_started_at desc);

alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;
grant select, insert, update, delete on public.rate_limits to service_role;

-- 原子限流检查函数
create or replace function public.check_rate_limit(
  p_key text,
  p_window_seconds integer,
  p_max_requests integer
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz;
  v_current_count integer;
  v_reset_at timestamptz;
  v_retry_after integer;
begin
  -- 计算当前窗口起始时间（按整窗口对齐）
  v_window_start := date_trunc('second', now()) - (extract(epoch from date_trunc('second', now()))::integer % p_window_seconds) * interval '1 second';

  -- 原子递增计数
  insert into public.rate_limits (key, window_started_at, count)
  values (p_key, v_window_start, 1)
  on conflict (key, window_started_at)
  do update set count = rate_limits.count + 1
  returning count into v_current_count;

  -- 清理过期记录（保留最近3个窗口）
  delete from public.rate_limits
  where key = p_key
    and window_started_at < v_window_start - (p_window_seconds * 2) * interval '1 second';

  v_reset_at := v_window_start + p_window_seconds * interval '1 second';

  if v_current_count > p_max_requests then
    v_retry_after := greatest(1, ceil(extract(epoch from (v_reset_at - now()))));
    return json_build_object(
      'allowed', false,
      'remaining', 0,
      'reset_at', v_reset_at,
      'retry_after', v_retry_after
    );
  end if;

  return json_build_object(
    'allowed', true,
    'remaining', p_max_requests - v_current_count,
    'reset_at', v_reset_at,
    'retry_after', null
  );
end;
$$;

revoke all on function public.check_rate_limit(text, integer, integer) from public;
revoke all on function public.check_rate_limit(text, integer, integer) from anon;
revoke all on function public.check_rate_limit(text, integer, integer) from authenticated;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;
