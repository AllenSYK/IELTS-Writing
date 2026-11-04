-- Server-owned billing state. Sandbox accounts and live payments are isolated.
create table public.stripe_billing_customers (
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_account_id text not null,
  livemode boolean not null,
  stripe_customer_id text not null unique,
  checkout_request_id uuid,
  checkout_price_id text,
  checkout_session_id text,
  checkout_expires_at timestamptz,
  checkout_consent_at timestamptz,
  checkout_terms_version text,
  created_at timestamptz not null default now(),
  primary key (user_id, stripe_account_id, livemode)
);

create table public.stripe_billing_subscriptions (
  stripe_subscription_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_customer_id text not null references public.stripe_billing_customers(stripe_customer_id) on delete cascade,
  stripe_account_id text not null,
  livemode boolean not null,
  price_id text not null,
  billing_interval text not null check (billing_interval in ('month', 'year')),
  status text not null check (status in ('incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused')),
  current_period_end timestamptz,
  paid_through timestamptz,
  cancel_at_period_end boolean not null default false,
  risk_hold boolean not null default false,
  created_at timestamptz not null,
  observed_at timestamptz not null,
  last_used_at timestamptz
);
create index stripe_billing_subscriptions_access_idx
  on public.stripe_billing_subscriptions(user_id, stripe_account_id, livemode, paid_through desc);
create index stripe_billing_subscriptions_customer_idx
  on public.stripe_billing_subscriptions(stripe_customer_id);

create table public.stripe_billing_events (
  event_id text primary key,
  event_type text not null,
  stripe_subscription_id text not null,
  processed_at timestamptz not null default now()
);

alter table public.stripe_billing_customers enable row level security;
alter table public.stripe_billing_subscriptions enable row level security;
alter table public.stripe_billing_events enable row level security;
revoke all on public.stripe_billing_customers, public.stripe_billing_subscriptions, public.stripe_billing_events from public, anon, authenticated;
grant all on public.stripe_billing_customers, public.stripe_billing_subscriptions, public.stripe_billing_events to service_role;

-- Persist a single idempotency key before contacting Stripe. Concurrent clicks,
-- retries, and separate server instances reuse the same Checkout Session.
create function public.begin_stripe_checkout(p_customer_id text, p_price_id text)
returns table(request_id uuid, session_id text)
language plpgsql security invoker set search_path = ''
as $$
declare
  v_customer public.stripe_billing_customers%rowtype;
begin
  select * into strict v_customer from public.stripe_billing_customers
    where stripe_customer_id = p_customer_id for update;
  if v_customer.checkout_request_id is not null and v_customer.checkout_expires_at > now() then
    if v_customer.checkout_price_id is distinct from p_price_id then
      raise exception 'CHECKOUT_IN_PROGRESS';
    end if;
    return query select v_customer.checkout_request_id, v_customer.checkout_session_id;
    return;
  end if;
  update public.stripe_billing_customers set
    checkout_request_id = gen_random_uuid(), checkout_price_id = p_price_id,
    checkout_session_id = null, checkout_expires_at = now() + interval '25 hours',
    checkout_consent_at = now(), checkout_terms_version = '2026-10-25'
    where stripe_customer_id = p_customer_id returning * into v_customer;
  return query select v_customer.checkout_request_id, null::text;
end;
$$;
revoke all on function public.begin_stripe_checkout(text, text) from public, anon, authenticated;
grant execute on function public.begin_stripe_checkout(text, text) to service_role;

-- The event receipt and subscription projection commit together, so a failed
-- write remains retryable. Stale API observations cannot overwrite newer state.
create function public.sync_stripe_subscription(p_snapshot jsonb)
returns void language plpgsql security invoker set search_path = ''
as $$
declare
  v_user_id uuid;
  v_event_id text := p_snapshot->>'event_id';
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
  insert into public.stripe_billing_subscriptions as existing (
    stripe_subscription_id, user_id, stripe_customer_id, stripe_account_id, livemode,
    price_id, billing_interval, status, current_period_end, paid_through,
    cancel_at_period_end, risk_hold, created_at, observed_at
  ) values (
    p_snapshot->>'stripe_subscription_id', v_user_id, p_snapshot->>'stripe_customer_id',
    p_snapshot->>'stripe_account_id', (p_snapshot->>'livemode')::boolean,
    p_snapshot->>'price_id', p_snapshot->>'billing_interval', p_snapshot->>'status',
    (p_snapshot->>'current_period_end')::timestamptz, (p_snapshot->>'paid_through')::timestamptz,
    (p_snapshot->>'cancel_at_period_end')::boolean, (p_snapshot->>'risk_hold')::boolean,
    (p_snapshot->>'created_at')::timestamptz, (p_snapshot->>'observed_at')::timestamptz
  ) on conflict (stripe_subscription_id) do update set
    price_id = excluded.price_id, billing_interval = excluded.billing_interval,
    status = excluded.status, current_period_end = excluded.current_period_end,
    paid_through = excluded.paid_through, cancel_at_period_end = excluded.cancel_at_period_end,
    risk_hold = existing.risk_hold or excluded.risk_hold, observed_at = excluded.observed_at
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
