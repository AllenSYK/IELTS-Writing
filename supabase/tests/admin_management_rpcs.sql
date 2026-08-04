begin;

-- Transactional integration verification for
-- 20260804190000_repair_admin_management_rpcs.sql.
-- The final rollback keeps the target database unchanged.
do $test$
declare
  v_actor_id uuid := gen_random_uuid();
  v_role_user_id uuid := gen_random_uuid();
  v_user_id uuid := gen_random_uuid();
  v_delete_user_id uuid := gen_random_uuid();
  v_exhausted_user_id uuid := gen_random_uuid();
  v_counted_user_id uuid := gen_random_uuid();
  v_license_id uuid := gen_random_uuid();
  v_delete_license_id uuid := gen_random_uuid();
  v_exhausted_license_id uuid := gen_random_uuid();
  v_conflict_license_id uuid := gen_random_uuid();
  v_binding_id uuid := gen_random_uuid();
  v_delete_binding_id uuid := gen_random_uuid();
  v_exhausted_binding_id uuid := gen_random_uuid();
  v_counted_binding_id uuid := gen_random_uuid();
  v_conflict_binding_id uuid := gen_random_uuid();
  v_usage_id uuid := gen_random_uuid();
  v_old_expires_at timestamptz;
  v_snapshot record;
  v_error_seen boolean;
begin
  insert into auth.users (
    id,
    aud,
    role,
    email,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  )
  values
    (v_actor_id, 'authenticated', 'authenticated', 'rpc-admin@example.invalid', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
    (v_role_user_id, 'authenticated', 'authenticated', 'rpc-role@example.invalid', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
    (v_user_id, 'authenticated', 'authenticated', 'rpc-user@example.invalid', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
    (v_delete_user_id, 'authenticated', 'authenticated', 'rpc-delete@example.invalid', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
    (v_exhausted_user_id, 'authenticated', 'authenticated', 'rpc-exhausted@example.invalid', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
    (v_counted_user_id, 'authenticated', 'authenticated', 'rpc-counted@example.invalid', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());

  insert into public.profiles (id, email, role, license_status, license_expires_at)
  values
    (v_actor_id, 'rpc-admin@example.invalid', 'admin', 'inactive', null),
    (v_role_user_id, 'rpc-role@example.invalid', 'user', 'inactive', null),
    (v_user_id, 'rpc-user@example.invalid', 'user', 'active', now() + interval '10 days'),
    (v_delete_user_id, 'rpc-delete@example.invalid', 'user', 'active', now() + interval '20 days'),
    (v_exhausted_user_id, 'rpc-exhausted@example.invalid', 'user', 'inactive', null),
    (v_counted_user_id, 'rpc-counted@example.invalid', 'user', 'inactive', null)
  on conflict (id) do update
  set email = excluded.email,
      role = excluded.role,
      license_status = excluded.license_status,
      license_expires_at = excluded.license_expires_at;

  insert into public.license_codes (
    id, code_hash, code_prefix, plan, duration_days,
    max_activations, activation_count, status
  )
  values
    (v_license_id, md5(v_license_id::text), 'RPC-MAIN', 'standard', 30, 2, 1, 'active'),
    (v_delete_license_id, md5(v_delete_license_id::text), 'RPC-DELETE', 'standard', 30, 1, 1, 'exhausted'),
    (v_exhausted_license_id, md5(v_exhausted_license_id::text), 'RPC-FULL', 'standard', 30, 1, 1, 'exhausted'),
    (v_conflict_license_id, md5(v_conflict_license_id::text), 'RPC-CONFLICT', 'standard', 30, 2, 0, 'unused');

  insert into public.license_activations (
    id, license_id, user_id, email, activated_at, expires_at,
    status, revoked_at, revoked_reason
  )
  values
    (v_binding_id, v_license_id, v_user_id, 'rpc-user@example.invalid', now(), now() + interval '10 days', 'active', null, null),
    (v_delete_binding_id, v_delete_license_id, v_delete_user_id, 'rpc-delete@example.invalid', now(), now() + interval '20 days', 'active', null, null),
    (v_exhausted_binding_id, v_exhausted_license_id, v_exhausted_user_id, 'rpc-exhausted@example.invalid', now(), now() + interval '30 days', 'revoked', now(), 'EMAIL_UNBOUND'),
    (v_counted_binding_id, v_exhausted_license_id, v_counted_user_id, 'rpc-counted@example.invalid', now(), now() + interval '30 days', 'revoked', now(), 'ADMIN_REVOKED'),
    (v_conflict_binding_id, v_conflict_license_id, v_user_id, 'rpc-user@example.invalid', now(), now() + interval '30 days', 'revoked', now(), 'EMAIL_UNBOUND');

  insert into public.usage_records (id, user_id, license_id, action, success)
  values (v_usage_id, v_delete_user_id, v_delete_license_id, 'rpc-deletion-preservation-test', true);

  if (
    select count(*)
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'admin_mutate_license',
        'admin_mutate_binding',
        'admin_set_user_access',
        'admin_set_user_role',
        'admin_prepare_user_deletion',
        'get_web_license_access_state'
      )
  ) <> 6 then
    raise exception 'one or more administrator RPCs are missing';
  end if;

  if exists (
    select 1
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'admin_mutate_license',
        'admin_mutate_binding',
        'admin_set_user_access',
        'admin_set_user_role',
        'admin_prepare_user_deletion',
        'get_web_license_access_state'
      )
      and (
        not procedure.prosecdef
        or not coalesce(procedure.proconfig @> array['search_path=public']::text[], false)
        or has_function_privilege('anon', procedure.oid, 'execute')
        or has_function_privilege('authenticated', procedure.oid, 'execute')
        or not has_function_privilege('service_role', procedure.oid, 'execute')
      )
  ) then
    raise exception 'RPC security or execute privileges do not match the service-only contract';
  end if;

  select *
  into v_snapshot
  from public.get_web_license_access_state(v_user_id);
  if v_snapshot.profile_id <> v_user_id
    or v_snapshot.activation_id <> v_binding_id
    or v_snapshot.license_id <> v_license_id
    or v_snapshot.profile_license_status <> 'active'
  then
    raise exception 'website access state did not return the active profile, binding, and license';
  end if;

  perform public.admin_set_user_role(v_actor_id, v_role_user_id, 'admin');
  if (select role from public.profiles where id = v_role_user_id) <> 'admin' then
    raise exception 'setting an administrator role failed';
  end if;
  perform public.admin_set_user_role(v_actor_id, v_role_user_id, 'user');
  if (select role from public.profiles where id = v_role_user_id) <> 'user' then
    raise exception 'removing an administrator role failed';
  end if;

  v_error_seen := false;
  begin
    perform public.admin_set_user_role(v_actor_id, v_actor_id, 'user');
  exception when others then
    v_error_seen := sqlerrm = 'CANNOT_CHANGE_SELF';
  end;
  if not v_error_seen then
    raise exception 'self-demotion was not rejected with CANNOT_CHANGE_SELF';
  end if;

  perform public.admin_set_user_access(v_user_id, 'disable');
  if not exists (
    select 1 from auth.users
    where id = v_user_id and banned_until > now()
  ) then
    raise exception 'disabling a user did not ban the Auth account';
  end if;
  if not exists (
    select 1 from public.license_activations
    where id = v_binding_id and status = 'suspended' and revoked_reason = 'ACCOUNT_DISABLED'
  ) then
    raise exception 'disabling a user did not suspend the active binding';
  end if;
  if (select license_status from public.profiles where id = v_user_id) <> 'suspended' then
    raise exception 'disabling a user did not suspend profile access';
  end if;

  v_error_seen := false;
  begin
    perform public.admin_mutate_binding(v_binding_id, 'extend', 5, null);
  exception when others then
    v_error_seen := sqlerrm = 'ACCOUNT_DISABLED';
  end;
  if not v_error_seen then
    raise exception 'a disabled account did not return ACCOUNT_DISABLED';
  end if;

  perform public.admin_set_user_access(v_user_id, 'enable');
  if exists (
    select 1 from auth.users
    where id = v_user_id and banned_until > now()
  ) then
    raise exception 'enabling a user did not clear the Auth ban';
  end if;
  if not exists (
    select 1 from public.license_activations
    where id = v_binding_id and status = 'active' and revoked_reason is null
  ) then
    raise exception 'enabling a user did not restore the valid binding';
  end if;

  perform public.admin_mutate_license(
    p_license_id => v_license_id,
    p_plan => 'premium',
    p_duration_days => 60,
    p_max_activations => 2,
    p_expires_at => now() + interval '1 year',
    p_set_expires_at => true,
    p_note => 'verified mutation',
    p_set_note => true
  );
  if not exists (
    select 1 from public.license_codes
    where id = v_license_id
      and plan = 'premium'
      and duration_days = 60
      and max_activations = 2
      and note = 'verified mutation'
      and expires_at > now()
  ) then
    raise exception 'editing an activation code did not persist all requested fields';
  end if;

  perform public.admin_mutate_license(p_license_id => v_license_id, p_status => 'disabled');
  if not exists (
    select 1 from public.license_activations
    where id = v_binding_id and status = 'suspended' and revoked_reason = 'LICENSE_DISABLED'
  ) then
    raise exception 'disabling an activation code did not suspend its binding';
  end if;
  perform public.admin_mutate_license(p_license_id => v_license_id, p_status => 'active');
  if not exists (
    select 1 from public.license_activations
    where id = v_binding_id and status = 'active' and revoked_reason is null
  ) then
    raise exception 're-enabling an activation code did not restore its valid binding';
  end if;

  select expires_at into v_old_expires_at
  from public.license_activations where id = v_binding_id;
  perform public.admin_mutate_binding(v_binding_id, 'extend', 15, null);
  if (select expires_at from public.license_activations where id = v_binding_id)
    < v_old_expires_at + interval '15 days'
  then
    raise exception 'extending a binding did not add the requested duration';
  end if;

  perform public.admin_mutate_binding(v_binding_id, 'revoke', null, 'verification');
  if not exists (
    select 1 from public.license_activations
    where id = v_binding_id and status = 'revoked' and revoked_reason = 'verification'
  ) then
    raise exception 'revoking a binding did not retain the record and reason';
  end if;

  perform public.admin_mutate_binding(v_binding_id, 'rebind', null, null);
  if not exists (
    select 1 from public.license_activations
    where id = v_binding_id and status = 'active' and revoked_reason is null
  ) then
    raise exception 're-binding a revoked binding failed';
  end if;

  v_error_seen := false;
  begin
    perform public.admin_mutate_binding(v_conflict_binding_id, 'rebind', null, null);
  exception when others then
    v_error_seen := sqlerrm = 'USER_ALREADY_ACTIVE';
  end;
  if not v_error_seen then
    raise exception 'a second active binding did not return USER_ALREADY_ACTIVE';
  end if;

  perform public.admin_mutate_binding(v_binding_id, 'unbind', null, null);
  if not exists (
    select 1 from public.license_activations
    where id = v_binding_id and status = 'revoked' and revoked_reason = 'EMAIL_UNBOUND'
  ) then
    raise exception 'unbinding an email did not retain EMAIL_UNBOUND history';
  end if;
  if not exists (
    select 1 from public.license_codes
    where id = v_license_id and activation_count = 0 and status = 'unused'
  ) then
    raise exception 'unbinding an email did not release the activation slot';
  end if;

  perform public.admin_mutate_binding(v_binding_id, 'rebind', null, null);
  if not exists (
    select 1 from public.license_codes
    where id = v_license_id and activation_count = 1 and status = 'active'
  ) then
    raise exception 're-binding an email did not reclaim the activation slot';
  end if;

  v_error_seen := false;
  begin
    perform public.admin_mutate_binding(v_exhausted_binding_id, 'rebind', null, null);
  exception when others then
    v_error_seen := sqlerrm = 'LICENSE_EXHAUSTED';
  end;
  if not v_error_seen then
    raise exception 'an exhausted activation code did not return LICENSE_EXHAUSTED';
  end if;

  perform public.admin_mutate_license(p_license_id => v_license_id, p_status => 'revoked');
  if not exists (
    select 1 from public.license_codes where id = v_license_id and status = 'revoked'
  ) or not exists (
    select 1 from public.license_activations
    where id = v_binding_id and status = 'revoked' and revoked_reason = 'LICENSE_REVOKED'
  ) then
    raise exception 'revoking an activation code did not revoke its active binding';
  end if;

  v_error_seen := false;
  begin
    perform public.admin_mutate_license(p_license_id => v_license_id, p_status => 'active');
  exception when others then
    v_error_seen := sqlerrm = 'LICENSE_REVOKED';
  end;
  if not v_error_seen then
    raise exception 'a revoked activation code did not remain irreversible';
  end if;

  v_error_seen := false;
  begin
    perform public.admin_mutate_binding(v_binding_id, 'rebind', null, null);
  exception when others then
    v_error_seen := sqlerrm = 'LICENSE_UNAVAILABLE';
  end;
  if not v_error_seen then
    raise exception 'a revoked activation code did not return LICENSE_UNAVAILABLE';
  end if;

  v_error_seen := false;
  begin
    perform public.admin_mutate_license(p_license_id => gen_random_uuid(), p_status => 'disabled');
  exception when others then
    v_error_seen := sqlerrm = 'LICENSE_NOT_FOUND';
  end;
  if not v_error_seen then
    raise exception 'a missing activation code did not return LICENSE_NOT_FOUND';
  end if;

  v_error_seen := false;
  begin
    perform public.admin_mutate_binding(gen_random_uuid(), 'revoke', null, null);
  exception when others then
    v_error_seen := sqlerrm = 'BINDING_NOT_FOUND';
  end;
  if not v_error_seen then
    raise exception 'a missing binding did not return BINDING_NOT_FOUND';
  end if;

  perform public.admin_prepare_user_deletion(v_delete_user_id);
  if not exists (
    select 1 from auth.users
    where id = v_delete_user_id and deleted_at is null and banned_until > now()
  ) then
    raise exception 'deletion preparation did not retain and ban the Auth identity';
  end if;
  if not exists (
    select 1 from public.license_activations
    where id = v_delete_binding_id and status = 'revoked' and revoked_reason = 'ACCOUNT_DELETED'
  ) then
    raise exception 'deletion preparation did not retain and revoke binding history';
  end if;
  if not exists (
    select 1 from public.usage_records where id = v_usage_id and user_id = v_delete_user_id
  ) then
    raise exception 'deletion preparation removed user business data';
  end if;
  if not exists (
    select 1 from public.license_codes
    where id = v_delete_license_id and activation_count = 0 and status = 'unused'
  ) then
    raise exception 'deletion preparation did not release the activation slot';
  end if;

  v_error_seen := false;
  begin
    perform public.admin_mutate_binding(v_delete_binding_id, 'rebind', null, null);
  exception when others then
    v_error_seen := sqlerrm = 'ACCOUNT_DELETED';
  end;
  if not v_error_seen then
    raise exception 'deleted-account binding history did not return ACCOUNT_DELETED';
  end if;
end;
$test$;

rollback;
