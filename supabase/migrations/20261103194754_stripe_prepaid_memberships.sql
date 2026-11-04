-- One-time payments are separate from auto-renewing subscriptions.
create table public.stripe_billing_payments (
  checkout_session_id text primary key,
  payment_intent_id text not null unique,
  stripe_customer_id text not null references public.stripe_billing_customers(stripe_customer_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_account_id text not null,
  livemode boolean not null,
  amount integer not null,
  currency text not null,
  paid_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  risk_hold boolean not null default false,
  last_event_id text,
  last_event_type text,
  last_used_at timestamptz,
  check (expires_at = paid_at + interval '30 days'),
  check ((currency = 'cny' and amount = 1999) or (currency = 'gbp' and amount = 249))
);
create index stripe_billing_payments_access_idx
  on public.stripe_billing_payments(user_id, stripe_account_id, livemode, expires_at desc);
create index stripe_billing_payments_customer_idx on public.stripe_billing_payments(stripe_customer_id);
alter table public.stripe_billing_payments enable row level security;
revoke all on public.stripe_billing_payments from public, anon, authenticated;
grant select, insert, update, delete on public.stripe_billing_payments to service_role;

-- The primary key fixes the first confirmed access period. Repeated events and
-- reconciliation cannot extend it, and a late success cannot undo a refund hold.
create function public.sync_stripe_payment(p_snapshot jsonb)
returns void language plpgsql security invoker set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  select user_id into strict v_user_id from public.stripe_billing_customers
    where stripe_customer_id = p_snapshot->>'stripe_customer_id'
      and stripe_account_id = p_snapshot->>'stripe_account_id'
      and livemode = (p_snapshot->>'livemode')::boolean for update;
  if v_user_id <> (p_snapshot->>'user_id')::uuid then
    raise exception 'BILLING_CUSTOMER_MISMATCH';
  end if;
  insert into public.stripe_billing_payments as existing (
    checkout_session_id, payment_intent_id, stripe_customer_id, user_id,
    stripe_account_id, livemode, amount, currency, risk_hold, last_event_id, last_event_type
  ) values (
    p_snapshot->>'checkout_session_id', p_snapshot->>'payment_intent_id',
    p_snapshot->>'stripe_customer_id', v_user_id, p_snapshot->>'stripe_account_id',
    (p_snapshot->>'livemode')::boolean, (p_snapshot->>'amount')::integer,
    p_snapshot->>'currency', coalesce((p_snapshot->>'risk_hold')::boolean, false),
    p_snapshot->>'event_id', p_snapshot->>'event_type'
  ) on conflict (checkout_session_id) do update set
    risk_hold = existing.risk_hold or excluded.risk_hold,
    last_event_id = coalesce(excluded.last_event_id, existing.last_event_id),
    last_event_type = excluded.last_event_type
  where existing.user_id = excluded.user_id
    and existing.stripe_customer_id = excluded.stripe_customer_id
    and existing.stripe_account_id = excluded.stripe_account_id
    and existing.livemode = excluded.livemode
    and existing.payment_intent_id = excluded.payment_intent_id;
  if not found then raise exception 'BILLING_PAYMENT_MISMATCH'; end if;
end;
$$;
revoke all on function public.sync_stripe_payment(jsonb) from public, anon, authenticated;
grant execute on function public.sync_stripe_payment(jsonb) to service_role;

-- Serialize membership checks with checkout reservations and fulfillment.
create or replace function public.begin_stripe_checkout(p_customer_id text, p_price_id text)
returns table(request_id uuid, session_id text)
language plpgsql security invoker set search_path = ''
as $$
declare
  v_customer public.stripe_billing_customers%rowtype;
begin
  select * into strict v_customer from public.stripe_billing_customers
    where stripe_customer_id = p_customer_id for update;
  if exists (select 1 from public.stripe_billing_payments where stripe_customer_id = p_customer_id
    and not risk_hold and expires_at > now()) or exists (
    select 1 from public.stripe_billing_subscriptions where stripe_customer_id = p_customer_id
      and status not in ('canceled', 'incomplete_expired')) then
    raise exception 'CHECKOUT_ACTIVE_MEMBERSHIP';
  end if;
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
    checkout_consent_at = now(), checkout_terms_version = case when p_price_id in ('prepaid_30_days', 'prepaid_30_days_gbp') then '2026-11-03:prepaid' else '2026-10-25' end
    where stripe_customer_id = p_customer_id returning * into v_customer;
  return query select v_customer.checkout_request_id, null::text;
end;
$$;
revoke all on function public.begin_stripe_checkout(text, text) from public, anon, authenticated;
grant execute on function public.begin_stripe_checkout(text, text) to service_role;

