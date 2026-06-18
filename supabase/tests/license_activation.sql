begin;

do $test$
declare
  v_user_one uuid := gen_random_uuid();
  v_user_two uuid := gen_random_uuid();
  v_license_id uuid := gen_random_uuid();
  v_code_hash text := md5(gen_random_uuid()::text);
  v_result record;
  v_activation_count integer;
  v_status text;
  v_binding_count integer;
  v_binding_created_at timestamptz;
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
    (
      v_user_one,
      'authenticated',
      'authenticated',
      'license-test-one@example.invalid',
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      now(),
      now()
    ),
    (
      v_user_two,
      'authenticated',
      'authenticated',
      'license-test-two@example.invalid',
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      now(),
      now()
    );

  insert into public.license_codes (
    id,
    code_hash,
    code_prefix,
    plan,
    duration_days,
    max_activations,
    activation_count,
    status
  )
  values (
    v_license_id,
    v_code_hash,
    'IELTS-TEST',
    'standard',
    30,
    1,
    0,
    'unused'
  );

  select *
  into v_result
  from public.activate_license_code(
    v_code_hash,
    v_user_one,
    'license-test-one@example.invalid'
  );

  if not v_result.success then
    raise exception 'expected first activation success, got %: %', v_result.error_code, v_result.message;
  end if;

  select license.activation_count, license.status
  into v_activation_count, v_status
  from public.license_codes as license
  where license.id = v_license_id;

  if v_activation_count <> 1 then
    raise exception 'expected activation_count=1, got %', v_activation_count;
  end if;

  if v_status <> 'exhausted' then
    raise exception 'expected license status exhausted, got %', v_status;
  end if;

  select count(*), min(activation.created_at)
  into v_binding_count, v_binding_created_at
  from public.license_activations as activation
  where activation.license_id = v_license_id
    and activation.user_id = v_user_one;

  if v_binding_count <> 1 or v_binding_created_at is null then
    raise exception 'expected one activation with created_at default, got count=%, created_at=%',
      v_binding_count,
      v_binding_created_at;
  end if;

  select *
  into v_result
  from public.activate_license_code(
    v_code_hash,
    v_user_one,
    'license-test-one@example.invalid'
  );

  if v_result.success or v_result.error_code <> 'USER_ALREADY_ACTIVE' then
    raise exception 'expected USER_ALREADY_ACTIVE, got success=%, error_code=%',
      v_result.success,
      v_result.error_code;
  end if;

  select *
  into v_result
  from public.activate_license_code(
    v_code_hash,
    v_user_two,
    'license-test-two@example.invalid'
  );

  if v_result.success
    or v_result.error_code not in ('LICENSE_ALREADY_USED', 'LICENSE_EXHAUSTED')
  then
    raise exception 'expected LICENSE_ALREADY_USED or LICENSE_EXHAUSTED, got success=%, error_code=%',
      v_result.success,
      v_result.error_code;
  end if;
end;
$test$;

rollback;
