-- Run inside a disposable database or a transaction; this fixture always rolls back.
begin;
do $$
declare
  v_user uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_first uuid;
  v_again uuid;
  v_snapshot jsonb;
  v_denied boolean := false;
begin
  if has_function_privilege('authenticated', 'public.sync_stripe_subscription(jsonb)', 'execute')
    or has_function_privilege('anon', 'public.begin_stripe_checkout(text,text)', 'execute')
    or has_table_privilege('authenticated', 'public.stripe_billing_subscriptions', 'update') then
    raise exception 'Browser roles can modify billing state';
  end if;
  if not has_function_privilege('service_role', 'public.sync_stripe_subscription(jsonb)', 'execute') then
    raise exception 'Service role cannot fulfill payments';
  end if;
  if exists (select 1 from pg_class where oid in (
    'public.stripe_billing_customers'::regclass, 'public.stripe_billing_subscriptions'::regclass,
    'public.stripe_billing_events'::regclass) and not relrowsecurity) then
    raise exception 'Billing table is missing RLS';
  end if;
  insert into auth.users(id) values(v_user), (v_other);
  insert into public.stripe_billing_customers(user_id, stripe_customer_id, stripe_account_id, livemode)
    values(v_user, 'cus_schema_test', 'acct_schema_test', false);
  select request_id into v_first from public.begin_stripe_checkout('cus_schema_test', 'price_test');
  select request_id into v_again from public.begin_stripe_checkout('cus_schema_test', 'price_test');
  if v_first is distinct from v_again then raise exception 'Concurrent checkout retries get different keys'; end if;
  begin
    perform public.begin_stripe_checkout('cus_schema_test', 'price_other');
  exception when others then
    if sqlerrm = 'CHECKOUT_IN_PROGRESS' then v_denied := true; else raise; end if;
  end;
  if not v_denied then raise exception 'A pending checkout can be replaced by another price'; end if;
  if not exists (select 1 from public.stripe_billing_customers where stripe_customer_id = 'cus_schema_test'
    and checkout_consent_at is not null and checkout_terms_version = '2026-10-25') then
    raise exception 'Auto-renewal consent was not recorded';
  end if;
  v_snapshot := jsonb_build_object(
    'stripe_subscription_id', 'sub_schema_test', 'stripe_customer_id', 'cus_schema_test',
    'stripe_account_id', 'acct_schema_test', 'livemode', false, 'user_id', v_user,
    'price_id', 'price_test', 'billing_interval', 'month', 'status', 'active',
    'paid_through', '2026-12-01T00:00:00Z', 'current_period_end', '2026-12-01T00:00:00Z',
    'cancel_at_period_end', false, 'risk_hold', false, 'created_at', '2026-10-25T00:00:00Z',
    'observed_at', '2026-10-25T10:00:00Z', 'event_id', 'evt_schema_first', 'event_type', 'invoice.paid'
  );
  perform public.sync_stripe_subscription(v_snapshot);
  perform public.sync_stripe_subscription(v_snapshot || '{"paid_through":"2027-01-01T00:00:00Z"}'::jsonb);
  if not exists (select 1 from public.stripe_billing_subscriptions where stripe_subscription_id = 'sub_schema_test'
    and paid_through = '2026-12-01T00:00:00Z'::timestamptz) then
    raise exception 'Duplicate event changed fulfillment';
  end if;
  perform public.sync_stripe_subscription(v_snapshot || '{"event_id":"evt_schema_cancel","status":"canceled","observed_at":"2026-10-25T11:00:00Z"}'::jsonb);
  perform public.sync_stripe_subscription(v_snapshot || '{"event_id":"evt_schema_stale"}'::jsonb);
  if not exists (select 1 from public.stripe_billing_subscriptions where stripe_subscription_id = 'sub_schema_test' and status = 'canceled') then
    raise exception 'Out-of-order delivery restored canceled access';
  end if;
  perform public.sync_stripe_subscription(v_snapshot || '{"event_id":"evt_schema_risk","risk_hold":true}'::jsonb);
  perform public.sync_stripe_subscription(v_snapshot || '{"event_id":"evt_schema_refresh","observed_at":"2026-10-25T12:00:00Z"}'::jsonb);
  if not exists (select 1 from public.stripe_billing_subscriptions where stripe_subscription_id = 'sub_schema_test' and risk_hold) then
    raise exception 'Reconciliation cleared a payment risk hold';
  end if;
  v_denied := false;
  begin
    perform public.sync_stripe_subscription(v_snapshot || jsonb_build_object('user_id', v_other, 'event_id', 'evt_schema_wrong_user'));
  exception when others then
    if sqlerrm = 'BILLING_CUSTOMER_MISMATCH' then v_denied := true; else raise; end if;
  end;
  if not v_denied then raise exception 'A payment was reassigned to another user'; end if;
  if exists (select 1 from public.stripe_billing_events where event_id = 'evt_schema_wrong_user') then
    raise exception 'Failed fulfillment was recorded as processed';
  end if;
end;
$$;
rollback;
