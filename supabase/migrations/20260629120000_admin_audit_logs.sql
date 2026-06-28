-- 创建管理操作审计日志表
create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  resource_type text not null,
  resource_id text,
  request_id text,
  result text not null default 'success' check (result in ('success', 'failure', 'partial')),
  changed_fields jsonb,
  error_message text,
  ip_hash text,
  user_agent_summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- 创建索引
create index if not exists idx_admin_audit_logs_admin_user_id on public.admin_audit_logs(admin_user_id);
create index if not exists idx_admin_audit_logs_action on public.admin_audit_logs(action);
create index if not exists idx_admin_audit_logs_resource_type on public.admin_audit_logs(resource_type);
create index if not exists idx_admin_audit_logs_created_at on public.admin_audit_logs(created_at desc);
create index if not exists idx_admin_audit_logs_request_id on public.admin_audit_logs(request_id);

-- 启用 RLS
alter table public.admin_audit_logs enable row level security;

-- 撤销所有权限
revoke all on public.admin_audit_logs from anon, authenticated;

-- 只允许 service_role 完整访问
grant select, insert on public.admin_audit_logs to service_role;

-- 创建审计日志写入函数
create or replace function public.log_admin_action(
  p_admin_user_id uuid,
  p_action text,
  p_resource_type text,
  p_resource_id text default null,
  p_request_id text default null,
  p_result text default 'success',
  p_changed_fields jsonb default null,
  p_error_message text default null,
  p_ip_hash text default null,
  p_user_agent_summary text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_log_id uuid;
begin
  insert into public.admin_audit_logs (
    admin_user_id,
    action,
    resource_type,
    resource_id,
    request_id,
    result,
    changed_fields,
    error_message,
    ip_hash,
    user_agent_summary,
    metadata
  ) values (
    p_admin_user_id,
    p_action,
    p_resource_type,
    p_resource_id,
    p_request_id,
    p_result,
    p_changed_fields,
    p_error_message,
    p_ip_hash,
    p_user_agent_summary,
    p_metadata
  )
  returning id into v_log_id;
  
  return v_log_id;
exception
  when others then
    -- 审计日志写入失败不应该阻断主业务
    -- 但需要记录到 PostgreSQL 日志
    raise warning 'Failed to write audit log: %', SQLERRM;
    return null;
end;
$$;

-- 授予 service_role 执行权限
grant execute on function public.log_admin_action to service_role;

-- 添加注释
comment on table public.admin_audit_logs is '管理操作审计日志，记录所有敏感管理操作';
comment on column public.admin_audit_logs.action is '操作类型，如 create_license, reveal_code, update_settings 等';
comment on column public.admin_audit_logs.resource_type is '资源类型，如 license, user, past_paper, settings 等';
comment on column public.admin_audit_logs.resource_id is '资源ID，可以是UUID或其他标识符';
comment on column public.admin_audit_logs.request_id is '请求ID，用于追踪完整请求链路';
comment on column public.admin_audit_logs.result is '操作结果：success, failure, partial';
comment on column public.admin_audit_logs.changed_fields is '变更的字段，只记录字段名和安全摘要，不记录敏感值';
comment on column public.admin_audit_logs.ip_hash is 'IP地址的哈希值，不存储原始IP';
comment on column public.admin_audit_logs.user_agent_summary is 'User-Agent摘要，只保留浏览器和操作系统信息';
