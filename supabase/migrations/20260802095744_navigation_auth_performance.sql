begin;

-- The broad legacy policy made every activation visible through the Data API.
-- Admin reads use the service role and do not require an RLS bypass policy.
drop policy if exists "allow admin read activations" on public.license_activations;

drop policy if exists license_activations_select_own on public.license_activations;
create policy license_activations_select_own
on public.license_activations for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
on public.profiles for select
to authenticated
using ((select auth.uid()) = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists usage_records_select_own on public.usage_records;
create policy usage_records_select_own
on public.usage_records for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists study_plan_adj_txn_select_own on public.study_plan_adjustment_transactions;
create policy study_plan_adj_txn_select_own
on public.study_plan_adjustment_transactions for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists study_plan_wallets_select_own on public.study_plan_adjustment_wallets;
create policy study_plan_wallets_select_own
on public.study_plan_adjustment_wallets for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists study_plan_gen_jobs_select_own on public.study_plan_generation_jobs;
create policy study_plan_gen_jobs_select_own
on public.study_plan_generation_jobs for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists study_plan_gen_jobs_insert_own on public.study_plan_generation_jobs;
create policy study_plan_gen_jobs_insert_own
on public.study_plan_generation_jobs for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists writing_error_patterns_select_own on public.writing_error_patterns;
create policy writing_error_patterns_select_own
on public.writing_error_patterns for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists writing_error_patterns_insert_own on public.writing_error_patterns;
create policy writing_error_patterns_insert_own
on public.writing_error_patterns for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists writing_error_patterns_update_own on public.writing_error_patterns;
create policy writing_error_patterns_update_own
on public.writing_error_patterns for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists writing_error_occurrences_select_own on public.writing_error_occurrences;
create policy writing_error_occurrences_select_own
on public.writing_error_occurrences for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists writing_error_occurrences_insert_own on public.writing_error_occurrences;
create policy writing_error_occurrences_insert_own
on public.writing_error_occurrences for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists writing_error_reviews_select_own on public.writing_error_reviews;
create policy writing_error_reviews_select_own
on public.writing_error_reviews for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists writing_error_reviews_insert_own on public.writing_error_reviews;
create policy writing_error_reviews_insert_own
on public.writing_error_reviews for insert
to authenticated
with check ((select auth.uid()) = user_id);

-- Service-only RPC: profile, activation, and license state are returned by one
-- PostgREST request while the function retains invoker permissions.
create or replace function public.get_web_license_access_state(p_user_id uuid)
returns table (
  profile_id uuid,
  profile_email text,
  profile_phone text,
  profile_role text,
  profile_license_status text,
  profile_license_expires_at timestamptz,
  profile_display_name text,
  profile_manual_average_score numeric,
  activation_id uuid,
  activation_license_id uuid,
  activation_email text,
  activation_activated_at timestamptz,
  activation_expires_at timestamptz,
  activation_status text,
  activation_last_used_at timestamptz,
  license_id uuid,
  license_plan text,
  license_status text,
  license_expires_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    p.id,
    p.email,
    p.phone,
    p.role,
    p.license_status,
    p.license_expires_at,
    p.display_name,
    p.manual_average_score,
    access.activation_id,
    access.activation_license_id,
    access.activation_email,
    access.activation_activated_at,
    access.activation_expires_at,
    access.activation_status,
    access.activation_last_used_at,
    access.license_id,
    access.license_plan,
    access.license_status,
    access.license_expires_at
  from public.profiles p
  left join lateral (
    select
      a.id as activation_id,
      a.license_id as activation_license_id,
      a.email as activation_email,
      a.activated_at as activation_activated_at,
      a.expires_at as activation_expires_at,
      a.status as activation_status,
      a.last_used_at as activation_last_used_at,
      c.id as license_id,
      c.plan as license_plan,
      c.status as license_status,
      c.expires_at as license_expires_at
    from public.license_activations a
    join public.license_codes c on c.id = a.license_id
    where a.user_id = p_user_id
      and a.status = 'active'
      and a.expires_at > now()
    order by a.expires_at desc
    limit 1
  ) access on true
  where p.id = p_user_id;
$$;

revoke all on function public.get_web_license_access_state(uuid) from public, anon, authenticated;
grant execute on function public.get_web_license_access_state(uuid) to service_role;

-- Remove only indexes confirmed by the live advisor to duplicate an existing
-- primary-key or unique-constraint index.
drop index if exists public.admin_settings_id_reconcile_uidx;
drop index if exists public.license_activations_id_reconcile_uidx;
drop index if exists public.license_codes_code_hash_reconcile_uidx;
drop index if exists public.license_codes_id_reconcile_uidx;
drop index if exists public.profiles_id_reconcile_uidx;

commit;
