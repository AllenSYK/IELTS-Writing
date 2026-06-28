-- 创建管理总览统计 RPC 函数
-- 使用数据库聚合而不是读取大量记录后在内存中统计

create or replace function public.get_admin_overview_stats()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result json;
begin
  select json_build_object(
    'totalLicenses', (select count(*) from license_codes),
    'availableLicenses', (
      select count(*) from license_codes 
      where status in ('unused', 'active') 
      and activation_count < max_activations
      and (expires_at is null or expires_at > now())
    ),
    'exhaustedLicenses', (
      select count(*) from license_codes 
      where status = 'exhausted' 
      or (activation_count >= max_activations and status != 'disabled')
    ),
    'totalProfiles', (select count(*) from profiles),
    'adminProfiles', (select count(*) from profiles where role = 'admin'),
    'totalBindings', (select count(*) from license_activations),
    'activeBindings', (
      select count(*) from license_activations 
      where status = 'active' 
      and expires_at > now()
    ),
    'unboundUsers', (
      select count(*) from profiles p
      where p.role != 'admin'
      and not exists (
        select 1 from license_activations la
        where la.user_id = p.id
        and la.status = 'active'
        and la.expires_at > now()
        and la.revoked_reason is null
      )
    )
  ) into v_result;
  
  return v_result;
end;
$$;

-- 授予 service_role 执行权限
grant execute on function public.get_admin_overview_stats() to service_role;

-- 创建获取最近记录的函数
create or replace function public.get_admin_recent_records()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result json;
begin
  select json_build_object(
    'recentLicenses', (
      select coalesce(json_agg(l), '[]'::json)
      from (
        select id, code_prefix, plan, status, activation_count, max_activations, expires_at, created_at
        from license_codes
        order by created_at desc
        limit 5
      ) l
    ),
    'recentBindings', (
      select coalesce(json_agg(b), '[]'::json)
      from (
        select la.id, la.user_id, la.email, la.status as binding_status, la.activated_at,
               json_build_object('id', lc.id, 'code_prefix', lc.code_prefix, 'plan', lc.plan) as license_codes
        from license_activations la
        left join license_codes lc on lc.id = la.license_id
        order by la.activated_at desc
        limit 5
      ) b
    ),
    'recentUsers', (
      select coalesce(json_agg(u), '[]'::json)
      from (
        select id, email, phone, role, license_status, created_at
        from profiles
        order by created_at desc
        limit 5
      ) u
    )
  ) into v_result;
  
  return v_result;
end;
$$;

-- 授予 service_role 执行权限
grant execute on function public.get_admin_recent_records() to service_role;
