-- Old and new app versions share the webhook during a staged release.
-- Missing trial fields from an old writer must preserve verified trial dates;
-- explicit nulls from a current writer still revoke unverified trial rights.
create or replace function public.sync_stripe_subscription(p_snapshot jsonb)
returns void language plpgsql security invoker set search_path = ''
as $$
declare
  v_user_id uuid;
  v_event_id text := p_snapshot->>'event_id';
  v_trial_offer text;
begin
  select user_id into strict v_user_id from public.stripe_billing_customers
    where stripe_customer_id = p_snapshot->>'stripe_customer_id'
      and stripe_account_id = p_snapshot->>'stripe_account_id'
      and livemode = (p_snapshot->>'livemode')::boolean for update;
  if v_user_id <> (p_snapshot->>'user_id')::uuid then
    raise exception 'BILLING_CUSTOMER_MISMATCH';
  end if;
  if v_event_id is not null then
    insert into public.stripe_billing_events(event_id, event_type, stripe_subscription_id)
      values(v_event_id, p_snapshot->>'event_type', p_snapshot->>'stripe_subscription_id')
      on conflict do nothing;
    if not found then return; end if;
  end if;
  -- Only a persisted server reservation on this mapped customer can issue trial rights.
  if p_snapshot->>'trial_request_id' is not null then
    update public.stripe_billing_trials set stripe_subscription_id = p_snapshot->>'stripe_subscription_id'
      where user_id = v_user_id and stripe_customer_id = p_snapshot->>'stripe_customer_id'
        and stripe_account_id = p_snapshot->>'stripe_account_id'
        and livemode = (p_snapshot->>'livemode')::boolean
        and request_id::text = p_snapshot->>'trial_request_id'
        and price_id = p_snapshot->>'price_id'
        and (stripe_subscription_id is null or stripe_subscription_id = p_snapshot->>'stripe_subscription_id')
      returning offer into v_trial_offer;
  end if;
  insert into public.stripe_billing_subscriptions as existing (
    stripe_subscription_id, user_id, stripe_customer_id, stripe_account_id, livemode,
    price_id, billing_interval, status, current_period_end, paid_through,
    cancel_at_period_end, risk_hold, created_at, observed_at, trial_start, trial_end, trial_offer
  ) values (
    p_snapshot->>'stripe_subscription_id', v_user_id, p_snapshot->>'stripe_customer_id',
    p_snapshot->>'stripe_account_id', (p_snapshot->>'livemode')::boolean,
    p_snapshot->>'price_id', p_snapshot->>'billing_interval', p_snapshot->>'status',
    (p_snapshot->>'current_period_end')::timestamptz, (p_snapshot->>'paid_through')::timestamptz,
    (p_snapshot->>'cancel_at_period_end')::boolean, (p_snapshot->>'risk_hold')::boolean,
    (p_snapshot->>'created_at')::timestamptz, (p_snapshot->>'observed_at')::timestamptz,
    (p_snapshot->>'trial_start')::timestamptz, (p_snapshot->>'trial_end')::timestamptz, v_trial_offer
  ) on conflict (stripe_subscription_id) do update set
    price_id = excluded.price_id, billing_interval = excluded.billing_interval,
    status = excluded.status, current_period_end = excluded.current_period_end,
    paid_through = excluded.paid_through, cancel_at_period_end = excluded.cancel_at_period_end,
    risk_hold = existing.risk_hold or excluded.risk_hold, observed_at = excluded.observed_at,
    trial_start = case when p_snapshot ? 'trial_start' then excluded.trial_start else existing.trial_start end,
    trial_end = case when p_snapshot ? 'trial_end' then excluded.trial_end else existing.trial_end end,
    trial_offer = coalesce(existing.trial_offer, excluded.trial_offer)
  where existing.observed_at <= excluded.observed_at;
  -- A risk event must still apply if its lifecycle snapshot was stale.
  if (p_snapshot->>'risk_hold')::boolean then
    update public.stripe_billing_subscriptions set risk_hold = true
      where stripe_subscription_id = p_snapshot->>'stripe_subscription_id';
  end if;
end;
$$;
revoke all on function public.sync_stripe_subscription(jsonb) from public, anon, authenticated;
grant execute on function public.sync_stripe_subscription(jsonb) to service_role;
