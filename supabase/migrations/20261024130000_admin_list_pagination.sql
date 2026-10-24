-- 管理端列表：在数据库执行筛选、计数与分页，替代“读取前 1000 条后内存分页”。
-- 同时为导出提供同一套筛选条件下的完整结果。

create or replace function public.admin_list_licenses(
  p_search text default '',
  p_status text default 'all',
  p_plan text default 'all',
  p_license_id uuid default null,
  p_page int default 1,
  p_page_size int default 50
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select
      id,
      code_prefix,
      plan,
      duration_days,
      max_activations,
      activation_count,
      status,
      expires_at,
      note,
      created_by,
      created_at,
      updated_at,
      case
        when status in ('revoked', 'disabled') then status
        when (expires_at is not null and expires_at <= now()) or status = 'expired' then 'expired'
        when activation_count >= max_activations then 'exhausted'
        when activation_count > 0 then 'partial'
        else 'unused'
      end as effective_status
    from public.license_codes
    where (p_license_id is null or id = p_license_id)
      and (p_plan = 'all' or plan = p_plan)
      and (
        coalesce(p_search, '') = ''
        or code_prefix ilike '%' || p_search || '%'
        or code_value ilike '%' || p_search || '%'
        or plan ilike '%' || p_search || '%'
        or coalesce(note, '') ilike '%' || p_search || '%'
      )
  ),
  filtered as (
    select * from base
    where p_status = 'all' or effective_status = p_status
  )
  select jsonb_build_object(
    'items',
    coalesce(
      (
        select jsonb_agg(to_jsonb(page_rows) order by page_rows.created_at desc)
        from (
          select * from filtered
          order by created_at desc
          offset ((greatest(p_page, 1) - 1) * greatest(p_page_size, 1))
          limit greatest(p_page_size, 1)
        ) page_rows
      ),
      '[]'::jsonb
    ),
    'total', (select count(*) from filtered)
  )
$$;

create or replace function public.admin_list_bindings(
  p_search text default '',
  p_status text default 'all',
  p_license_id uuid default null,
  p_email text default '',
  p_user_id uuid default null,
  p_expiring_days int default 14,
  p_page int default 1,
  p_page_size int default 50
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select
      b.id,
      b.license_id,
      b.user_id,
      b.email,
      b.activated_at,
      b.expires_at,
      b.status,
      b.last_used_at,
      b.revoked_at,
      b.revoked_reason,
      l.id as license_row_id,
      l.code_prefix as license_code_prefix,
      l.plan as license_plan,
      l.status as license_status,
      l.expires_at as license_expires_at,
      l.duration_days as license_duration_days,
      case
        when b.revoked_reason = 'EMAIL_UNBOUND' then 'unbound'
        when b.status in ('revoked', 'suspended') or l.status in ('revoked', 'disabled') then 'revoked'
        when b.status = 'expired'
          or l.status = 'expired'
          or (l.expires_at is not null and l.expires_at <= now())
          or b.expires_at <= now()
          then 'expired'
        when b.expires_at <= now() + (greatest(coalesce(p_expiring_days, 14), 1) || ' days')::interval then 'expiring'
        else 'active'
      end as binding_status
    from public.license_activations b
    left join public.license_codes l on l.id = b.license_id
    where (p_license_id is null or b.license_id = p_license_id)
      and (p_user_id is null or b.user_id = p_user_id)
      and (coalesce(p_email, '') = '' or b.email ilike '%' || p_email || '%')
      and (
        coalesce(p_search, '') = ''
        or b.email ilike '%' || p_search || '%'
        or b.user_id::text ilike '%' || p_search || '%'
        or coalesce(l.code_prefix, '') ilike '%' || p_search || '%'
      )
  ),
  filtered as (
    select * from base
    where p_status = 'all' or binding_status = p_status
  )
  select jsonb_build_object(
    'items',
    coalesce(
      (
        select jsonb_agg(to_jsonb(page_rows) order by page_rows.activated_at desc)
        from (
          select * from filtered
          order by activated_at desc
          offset ((greatest(p_page, 1) - 1) * greatest(p_page_size, 1))
          limit greatest(p_page_size, 1)
        ) page_rows
      ),
      '[]'::jsonb
    ),
    'total', (select count(*) from filtered)
  )
$$;

grant execute on function public.admin_list_licenses(text, text, text, uuid, int, int) to service_role;
grant execute on function public.admin_list_bindings(text, text, uuid, text, uuid, int, int, int) to service_role;
revoke execute on function public.admin_list_licenses(text, text, text, uuid, int, int) from public, anon, authenticated;
revoke execute on function public.admin_list_bindings(text, text, uuid, text, uuid, int, int, int) from public, anon, authenticated;
