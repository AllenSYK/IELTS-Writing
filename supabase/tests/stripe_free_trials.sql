-- Transactional fixtures; no account or trial remains after this verification.
begin;
do $$
declare
  v_user uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_first public.stripe_billing_trials%rowtype;
  v_again public.stripe_billing_trials%rowtype;
  v_snapshot jsonb;
  v_denied boolean;
begin
  if has_table_privilege('anon', 'public.stripe_billing_trials', 'select')
    or has_table_privilege('authenticated', 'public.stripe_billing_trials', 'insert')
    or has_function_privilege('authenticated', 'public.begin_stripe_trial(text,text,text)', 'execute') then
    raise exception 'Browser roles can read or issue trial rights';
  end if;
  if not exists(select 1 from pg_class where oid = 'public.stripe_billing_trials'::regclass and relrowsecurity) then
    raise exception 'Trial table has no RLS';
  end if;
  insert into auth.users(id) values(v_user), (v_other);
  insert into public.profiles(id, role, license_status) values(v_user, 'user', 'inactive'), (v_other, 'user', 'suspended')
    on conflict (id) do update set role = excluded.role, license_status = excluded.license_status;
  insert into public.stripe_billing_customers(user_id, stripe_customer_id, stripe_account_id, livemode)
    values(v_user, 'cus_trial_sql_fixture', 'acct_trial_sql_fixture', false),
      (v_other, 'cus_trial_suspended_fixture', 'acct_trial_sql_fixture', false);
  select * into v_first from public.begin_stripe_trial('cus_trial_sql_fixture', 'no_card', 'price_trial_fixture');
  select * into v_again from public.begin_stripe_trial('cus_trial_sql_fixture', 'no_card', 'price_trial_fixture');
  if v_first.request_id <> v_again.request_id then raise exception 'Retry changed trial request id'; end if;
  if v_first.auto_renew_consent_at is not null then raise exception 'No-card trial recorded auto-renew consent'; end if;
  v_denied := false;
  begin
    perform public.begin_stripe_trial('cus_trial_sql_fixture', 'card', 'price_trial_fixture');
  exception when others then
    if sqlerrm = 'TRIAL_OTHER_OFFER' then v_denied := true; else raise; end if;
  end;
  if not v_denied then raise exception 'One account reserved both trial offers'; end if;
  v_denied := false;
  begin
    perform public.begin_stripe_trial('cus_trial_suspended_fixture', 'no_card', 'price_trial_fixture');
  exception when others then
    if sqlerrm = 'TRIAL_NOT_ELIGIBLE' then v_denied := true; else raise; end if;
  end;
  if not v_denied then raise exception 'Suspended account obtained a trial'; end if;
  v_snapshot := jsonb_build_object(
    'stripe_subscription_id', 'sub_trial_sql_fixture', 'stripe_customer_id', 'cus_trial_sql_fixture',
    'stripe_account_id', 'acct_trial_sql_fixture', 'livemode', false, 'user_id', v_user,
    'price_id', 'price_trial_fixture', 'billing_interval', 'month', 'status', 'trialing',
    'current_period_end', now() + interval '1 day', 'paid_through', null,
    'cancel_at_period_end', true, 'risk_hold', false, 'created_at', now(), 'observed_at', now(),
    'trial_request_id', v_first.request_id, 'trial_start', now(), 'trial_end', now() + interval '1 day'
  );
  perform public.sync_stripe_subscription(v_snapshot);
  if not exists(select 1 from public.stripe_billing_subscriptions where stripe_subscription_id = 'sub_trial_sql_fixture'
    and trial_offer = 'no_card' and trial_end > now() and paid_through is null) then
    raise exception 'Verified trial did not project access without a payment';
  end if;
  -- A previous deployment does not send trial fields. Its later observation must not clear them.
  perform public.sync_stripe_subscription((v_snapshot - 'trial_start' - 'trial_end' - 'trial_request_id')
    || jsonb_build_object('observed_at', now() + interval '1 second'));
  if not exists(select 1 from public.stripe_billing_subscriptions where stripe_subscription_id = 'sub_trial_sql_fixture'
    and trial_start is not null and trial_end > now() and trial_offer = 'no_card') then
    raise exception 'Legacy webhook erased a verified trial';
  end if;
  -- A newer canonical observation can explicitly remove invalid trial dates.
  perform public.sync_stripe_subscription(v_snapshot || jsonb_build_object('trial_start', null, 'trial_end', null,
    'trial_request_id', null, 'observed_at', now() + interval '2 seconds'));
  if exists(select 1 from public.stripe_billing_subscriptions where stripe_subscription_id = 'sub_trial_sql_fixture'
    and trial_end is not null) then raise exception 'Explicit trial revocation was ignored'; end if;
  v_snapshot := v_snapshot || jsonb_build_object('observed_at', now() + interval '3 seconds');
  perform public.sync_stripe_subscription(v_snapshot || jsonb_build_object('status', 'canceled'));
  v_denied := false;
  begin
    perform public.begin_stripe_trial('cus_trial_sql_fixture', 'card', 'price_trial_fixture');
  exception when others then
    if sqlerrm = 'TRIAL_USED' then v_denied := true; else raise; end if;
  end;
  if not v_denied then raise exception 'Canceling a trial restored the opportunity'; end if;
  perform public.sync_stripe_subscription(v_snapshot || jsonb_build_object('stripe_subscription_id', 'sub_trial_forged_fixture', 'trial_request_id', gen_random_uuid()));
  if exists(select 1 from public.stripe_billing_subscriptions where stripe_subscription_id = 'sub_trial_forged_fixture' and trial_offer is not null) then
    raise exception 'Unreserved subscription granted trial access';
  end if;
end;
$$;
rollback;
