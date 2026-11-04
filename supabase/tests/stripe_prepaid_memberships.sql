-- Transactional fixtures never create a lasting account or membership.
begin;
do $$
declare
  v_user uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_snapshot jsonb;
  v_expiry timestamptz;
  v_denied boolean := false;
  v_role text;
  v_operation text;
begin
  foreach v_role in array array['anon', 'authenticated'] loop
    foreach v_operation in array array['select', 'insert', 'update', 'delete'] loop
      if has_table_privilege(v_role, 'public.stripe_billing_payments', v_operation) then
        raise exception 'Browser role % can % payments', v_role, v_operation;
      end if;
    end loop;
    if has_function_privilege(v_role, 'public.sync_stripe_payment(jsonb)', 'execute') then
      raise exception 'Browser role can fulfill payments';
    end if;
  end loop;
  if not has_function_privilege('service_role', 'public.sync_stripe_payment(jsonb)', 'execute')
    or not (select relrowsecurity from pg_class where oid = 'public.stripe_billing_payments'::regclass) then
    raise exception 'Payment fulfillment permissions or RLS are incorrect';
  end if;
  insert into auth.users(id) values(v_user), (v_other);
  insert into public.stripe_billing_customers(user_id, stripe_customer_id, stripe_account_id, livemode)
    values(v_user, 'cus_prepaid_schema_test', 'acct_prepaid_schema_test', false);
  v_snapshot := jsonb_build_object(
    'checkout_session_id', 'cs_prepaid_schema_test', 'payment_intent_id', 'pi_prepaid_schema_test',
    'stripe_customer_id', 'cus_prepaid_schema_test', 'stripe_account_id', 'acct_prepaid_schema_test',
    'livemode', false, 'user_id', v_user, 'amount', 1999, 'currency', 'cny',
    'risk_hold', false, 'event_id', 'evt_prepaid_schema_test', 'event_type', 'checkout.session.completed'
  );
  perform public.sync_stripe_payment(v_snapshot);
  begin
    perform public.begin_stripe_checkout('cus_prepaid_schema_test', 'prepaid_30_days_gbp');
  exception when others then
    if sqlerrm = 'CHECKOUT_ACTIVE_MEMBERSHIP' then v_denied := true; else raise; end if;
  end;
  if not v_denied then raise exception 'Active membership allowed a duplicate checkout'; end if;
  v_denied := false;
  -- Make the original receipt older so a duplicate would visibly extend it.
  update public.stripe_billing_payments set paid_at = now() - interval '1 day', expires_at = now() + interval '29 days'
    where checkout_session_id = 'cs_prepaid_schema_test';
  select expires_at into v_expiry from public.stripe_billing_payments where checkout_session_id = 'cs_prepaid_schema_test';
  perform public.sync_stripe_payment(v_snapshot);
  perform public.sync_stripe_payment(v_snapshot || '{"risk_hold":true,"event_type":"charge.refunded"}'::jsonb);
  perform public.sync_stripe_payment(v_snapshot || '{"event_id":null,"event_type":"reconcile"}'::jsonb);
  if not exists (select 1 from public.stripe_billing_payments
    where checkout_session_id = 'cs_prepaid_schema_test' and expires_at = v_expiry
      and expires_at = paid_at + interval '30 days' and risk_hold) then
    raise exception 'Retry extended access or cleared the refund hold';
  end if;
  begin
    perform public.sync_stripe_payment(v_snapshot || jsonb_build_object('user_id', v_other));
  exception when others then
    if sqlerrm = 'BILLING_CUSTOMER_MISMATCH' then v_denied := true; else raise; end if;
  end;
  if not v_denied then raise exception 'Payment was reassigned to a different user'; end if;
  v_denied := false;
  begin
    perform public.sync_stripe_payment(v_snapshot || '{"checkout_session_id":"cs_wrong_amount","payment_intent_id":"pi_wrong_amount","amount":1}'::jsonb);
  exception when check_violation then v_denied := true;
  end;
  if not v_denied then raise exception 'Wrong payment amount was accepted'; end if;
  perform public.sync_stripe_payment(v_snapshot || '{"checkout_session_id":"cs_gbp","payment_intent_id":"pi_gbp","amount":249,"currency":"gbp"}'::jsonb);
  if not exists (select 1 from public.stripe_billing_payments where checkout_session_id = 'cs_gbp' and amount = 249 and currency = 'gbp') then
    raise exception 'GBP 2.49 payment was not fulfilled';
  end if;
end;
$$;
rollback;
