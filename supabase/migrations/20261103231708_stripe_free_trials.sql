-- One trial opportunity per user and Stripe environment, shared by both offers.
create table public.stripe_billing_trials (
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_account_id text not null,
  livemode boolean not null,
  stripe_customer_id text not null references public.stripe_billing_customers(stripe_customer_id) on delete cascade,
  request_id uuid not null unique default gen_random_uuid(),
  offer text not null check (offer in ('no_card', 'card')),
  price_id text not null,
  reserved_at timestamptz not null default date_trunc('second', now()),
  auto_renew_consent_at timestamptz,
  stripe_subscription_id text unique,
  checkout_session_id text unique,
  primary key (user_id, stripe_account_id, livemode),
  check ((offer = 'card') = (auto_renew_consent_at is not null))
);
create index stripe_billing_trials_customer_idx on public.stripe_billing_trials(stripe_customer_id);
alter table public.stripe_billing_trials enable row level security;
revoke all on public.stripe_billing_trials from public, anon, authenticated;
grant all on public.stripe_billing_trials to service_role;

alter table public.stripe_billing_subscriptions
  add column trial_start timestamptz,
  add column trial_end timestamptz,
  add column trial_offer text check (trial_offer in ('no_card', 'card'));
create index stripe_billing_subscriptions_trial_idx
  on public.stripe_billing_subscriptions(user_id, stripe_account_id, livemode, trial_end)
  where status = 'trialing' and not risk_hold;

create function public.begin_stripe_trial(p_customer_id text, p_offer text, p_price_id text)
returns setof public.stripe_billing_trials
language plpgsql security invoker set search_path = ''
as $$
declare
  v_customer public.stripe_billing_customers%rowtype;
  v_trial public.stripe_billing_trials%rowtype;
begin
  if p_offer not in ('no_card', 'card') or p_price_id = '' then raise exception 'TRIAL_NOT_ELIGIBLE'; end if;
  select * into strict v_customer from public.stripe_billing_customers
    where stripe_customer_id = p_customer_id for update;
  select * into v_trial from public.stripe_billing_trials
    where user_id = v_customer.user_id and stripe_account_id = v_customer.stripe_account_id
      and livemode = v_customer.livemode for update;
  if found then
    if v_trial.stripe_subscription_id is not null then raise exception 'TRIAL_USED'; end if;
    if v_trial.offer <> p_offer then raise exception 'TRIAL_OTHER_OFFER'; end if;
    return next v_trial;
    return;
  end if;
  if not exists (select 1 from public.profiles where id = v_customer.user_id
    and role <> 'admin' and license_status <> 'suspended')
    or exists (select 1 from public.stripe_billing_subscriptions where stripe_customer_id = p_customer_id
      and (trial_offer is not null or status not in ('canceled', 'incomplete_expired')))
    or exists (select 1 from public.stripe_billing_payments where stripe_customer_id = p_customer_id
      and not risk_hold and expires_at > now())
    or exists (select 1 from public.license_activations where user_id = v_customer.user_id
      and status = 'active' and expires_at > now()) then
    raise exception 'TRIAL_NOT_ELIGIBLE';
  end if;
  if v_customer.checkout_request_id is not null and v_customer.checkout_expires_at > now() then
    raise exception 'TRIAL_CHECKOUT_PENDING';
  end if;
  insert into public.stripe_billing_trials(user_id, stripe_account_id, livemode, stripe_customer_id, offer, price_id, auto_renew_consent_at)
    values(v_customer.user_id, v_customer.stripe_account_id, v_customer.livemode, p_customer_id, p_offer, p_price_id,
      case when p_offer = 'card' then now() else null end) returning * into v_trial;
  -- Share the existing checkout lock so trial claims cannot race a paid checkout.
  update public.stripe_billing_customers set checkout_request_id = v_trial.request_id,
    checkout_price_id = 'trial:' || p_offer, checkout_session_id = null,
    checkout_expires_at = now() + interval '25 hours'
    where stripe_customer_id = p_customer_id;
  return next v_trial;
end;
$$;
revoke all on function public.begin_stripe_trial(text, text, text) from public, anon, authenticated;
grant execute on function public.begin_stripe_trial(text, text, text) to service_role;

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
    trial_start = excluded.trial_start, trial_end = excluded.trial_end,
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
