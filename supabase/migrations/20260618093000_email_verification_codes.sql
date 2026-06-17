create extension if not exists pgcrypto;

create table if not exists public.email_verification_codes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  purpose text not null default 'register' check (purpose in ('register')),
  code_hash text not null,
  expires_at timestamptz not null,
  verified_at timestamptz,
  consumed_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  registration_token_hash text,
  registration_token_expires_at timestamptz,
  created_ip_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_email_verification_codes_email_purpose_created
  on public.email_verification_codes(email, purpose, created_at desc);

create index if not exists idx_email_verification_codes_expires
  on public.email_verification_codes(expires_at);

create index if not exists idx_email_verification_codes_token
  on public.email_verification_codes(registration_token_hash)
  where registration_token_hash is not null;

create index if not exists idx_email_verification_codes_active
  on public.email_verification_codes(email, purpose, expires_at)
  where consumed_at is null;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_email_verification_codes_updated_at on public.email_verification_codes;
create trigger trg_email_verification_codes_updated_at
before update on public.email_verification_codes
for each row execute function public.set_updated_at();

create or replace function public.cleanup_expired_email_verification_codes()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer := 0;
begin
  delete from public.email_verification_codes
  where expires_at < now() - interval '24 hours'
     or (consumed_at is not null and consumed_at < now() - interval '24 hours')
     or (registration_token_expires_at is not null and registration_token_expires_at < now() - interval '24 hours');

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

alter table public.email_verification_codes enable row level security;

revoke all on public.email_verification_codes from anon, authenticated;
revoke all on function public.cleanup_expired_email_verification_codes() from public, anon, authenticated;

grant select, insert, update, delete on public.email_verification_codes to service_role;
grant execute on function public.cleanup_expired_email_verification_codes() to service_role;
