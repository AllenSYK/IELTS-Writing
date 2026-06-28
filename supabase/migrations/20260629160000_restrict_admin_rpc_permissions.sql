-- 限制 SECURITY DEFINER RPC 只允许 service_role 调用
-- 这些函数使用 security definer 提升权限，必须限制调用方

-- 1. log_admin_action
revoke all on function public.log_admin_action(uuid, text, text, text, text, text, jsonb, text, text, text, jsonb) from public;
revoke all on function public.log_admin_action(uuid, text, text, text, text, text, jsonb, text, text, text, jsonb) from anon;
revoke all on function public.log_admin_action(uuid, text, text, text, text, text, jsonb, text, text, text, jsonb) from authenticated;
grant execute on function public.log_admin_action(uuid, text, text, text, text, text, jsonb, text, text, text, jsonb) to service_role;

-- 2. get_admin_overview_stats
revoke all on function public.get_admin_overview_stats() from public;
revoke all on function public.get_admin_overview_stats() from anon;
revoke all on function public.get_admin_overview_stats() from authenticated;
grant execute on function public.get_admin_overview_stats() to service_role;

-- 3. get_admin_recent_records
revoke all on function public.get_admin_recent_records() from public;
revoke all on function public.get_admin_recent_records() from anon;
revoke all on function public.get_admin_recent_records() from authenticated;
grant execute on function public.get_admin_recent_records() to service_role;
