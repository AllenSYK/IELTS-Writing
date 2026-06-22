-- ============================================================
-- Past Paper Questions
-- ============================================================

create table if not exists public.past_paper_questions (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'draft'
    check (status in ('draft', 'analyzing', 'review_pending', 'published', 'unpublished', 'archived', 'analysis_failed')),
  task_type text not null
    check (task_type in ('task1_academic', 'task1_general', 'task2', 'full_test', 'unknown')),
  title text not null default '',
  question_text text not null default '',
  summary text not null default '',
  source_type text not null default 'curated'
    check (source_type in ('official', 'published_collection', 'recalled', 'curated')),
  source_name text,
  source_year integer,
  source_reference text,
  frequency_level text not null default 'normal'
    check (frequency_level in ('high', 'medium_high', 'normal', 'low')),
  frequency_source text not null default 'admin'
    check (frequency_source in ('admin', 'ai_suggested')),
  difficulty text
    check (difficulty in ('easy', 'medium', 'hard') or difficulty is null),
  task1_visual_types jsonb,
  task1_visual_data jsonb,
  task2_question_type text,
  topics text[] not null default '{}',
  keywords text[] not null default '{}',
  source_image_path text,
  show_source_image boolean not null default false,
  ai_analysis jsonb,
  ai_model text,
  ai_analyzed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  published_at timestamptz,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_past_paper_questions_status
  on public.past_paper_questions(status, task_type, frequency_level);

create index if not exists idx_past_paper_questions_source
  on public.past_paper_questions(source_type, source_year);

create index if not exists idx_past_paper_questions_created
  on public.past_paper_questions(created_at desc);

create index if not exists idx_past_paper_questions_topics
  on public.past_paper_questions using gin(topics);

create trigger trg_past_paper_questions_updated_at
before update on public.past_paper_questions
for each row execute function public.set_updated_at();

alter table public.past_paper_questions enable row level security;

drop policy if exists "past_paper_questions_select_published" on public.past_paper_questions;
create policy "past_paper_questions_select_published"
on public.past_paper_questions
for select
to authenticated
using (status = 'published');

revoke all on public.past_paper_questions from anon, authenticated;
grant select on public.past_paper_questions to authenticated;
grant select, insert, update, delete on public.past_paper_questions to service_role;

-- ============================================================
-- Storage bucket for past paper source images (admin private)
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'past-paper-images',
  'past-paper-images',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- ============================================================
-- Study Plan Profiles (user preferences)
-- ============================================================

create table if not exists public.study_plan_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  overall_target numeric(2,1) not null default 6.5
    check (overall_target >= 1.0 and overall_target <= 9.0),
  task1_target numeric(2,1) not null default 6.0
    check (task1_target >= 1.0 and task1_target <= 9.0),
  task2_target numeric(2,1) not null default 6.5
    check (task2_target >= 1.0 and task2_target <= 9.0),
  exam_date date,
  sessions_per_week integer not null default 4
    check (sessions_per_week >= 1 and sessions_per_week <= 7),
  minutes_per_session integer not null default 45
    check (minutes_per_session >= 10 and minutes_per_session <= 240),
  preferred_days integer[] not null default '{}',
  include_full_tests boolean not null default true,
  include_past_papers boolean not null default true,
  task1_ratio numeric(3,2) not null default 0.40
    check (task1_ratio >= 0.10 and task1_ratio <= 0.90),
  task2_ratio numeric(3,2) not null default 0.60
    check (task2_ratio >= 0.10 and task2_ratio <= 0.90),
  prefer_weakness boolean not null default true,
  weekend_extended boolean not null default false,
  timezone text not null default 'Asia/Shanghai',
  updated_at timestamptz not null default now()
);

create trigger trg_study_plan_profiles_updated_at
before update on public.study_plan_profiles
for each row execute function public.set_updated_at();

alter table public.study_plan_profiles enable row level security;

drop policy if exists "study_plan_profiles_select_own" on public.study_plan_profiles;
create policy "study_plan_profiles_select_own"
on public.study_plan_profiles
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "study_plan_profiles_insert_own" on public.study_plan_profiles;
create policy "study_plan_profiles_insert_own"
on public.study_plan_profiles
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "study_plan_profiles_update_own" on public.study_plan_profiles;
create policy "study_plan_profiles_update_own"
on public.study_plan_profiles
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

revoke all on public.study_plan_profiles from anon, authenticated;
grant select, insert, update on public.study_plan_profiles to authenticated;
grant select, insert, update, delete on public.study_plan_profiles to service_role;

-- ============================================================
-- Study Plans
-- ============================================================

create table if not exists public.study_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  version integer not null default 1,
  status text not null default 'active'
    check (status in ('active', 'replaced', 'completed')),
  period_start date not null,
  period_end date not null,
  diagnosis jsonb not null default '{}'::jsonb,
  preferences_snapshot jsonb not null default '{}'::jsonb,
  goals_snapshot jsonb not null default '{}'::jsonb,
  ai_model text,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists idx_study_plans_user_active
  on public.study_plans(user_id)
  where status = 'active';

create index if not exists idx_study_plans_user_version
  on public.study_plans(user_id, version desc);

create index if not exists idx_study_plans_user_status
  on public.study_plans(user_id, status, created_at desc);

alter table public.study_plans enable row level security;

drop policy if exists "study_plans_select_own" on public.study_plans;
create policy "study_plans_select_own"
on public.study_plans
for select
to authenticated
using ((select auth.uid()) = user_id);

revoke all on public.study_plans from anon, authenticated;
grant select on public.study_plans to authenticated;
grant select, insert, update, delete on public.study_plans to service_role;

-- ============================================================
-- Study Plan Tasks
-- ============================================================

create table if not exists public.study_plan_tasks (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.study_plans(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  scheduled_date date not null,
  task_type text not null
    check (task_type in ('task1', 'task2', 'full_test', 'grammar_drill', 'vocabulary_drill', 'review')),
  source text not null default 'built_in'
    check (source in ('past_paper', 'built_in', 'weakness_drill', 'review')),
  question_id text,
  focus_criteria text[] not null default '{}',
  focus_error_tags text[] not null default '{}',
  estimated_minutes integer not null default 40
    check (estimated_minutes >= 5 and estimated_minutes <= 240),
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'completed', 'skipped')),
  writing_record_id uuid,
  draft_id text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_study_plan_tasks_plan
  on public.study_plan_tasks(plan_id, scheduled_date);

create index if not exists idx_study_plan_tasks_user_date
  on public.study_plan_tasks(user_id, scheduled_date, status);

create index if not exists idx_study_plan_tasks_status
  on public.study_plan_tasks(user_id, status);

create trigger trg_study_plan_tasks_updated_at
before update on public.study_plan_tasks
for each row execute function public.set_updated_at();

alter table public.study_plan_tasks enable row level security;

drop policy if exists "study_plan_tasks_select_own" on public.study_plan_tasks;
create policy "study_plan_tasks_select_own"
on public.study_plan_tasks
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "study_plan_tasks_update_own" on public.study_plan_tasks;
create policy "study_plan_tasks_update_own"
on public.study_plan_tasks
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

revoke all on public.study_plan_tasks from anon, authenticated;
grant select, update on public.study_plan_tasks to authenticated;
grant select, insert, update, delete on public.study_plan_tasks to service_role;

-- ============================================================
-- Study Plan Generation Events (for monthly limit)
-- ============================================================

create table if not exists public.study_plan_generation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid not null references public.study_plans(id) on delete cascade,
  generated_at timestamptz not null default now(),
  month_key text not null
);

create index if not exists idx_study_plan_gen_events_user_month
  on public.study_plan_generation_events(user_id, month_key);

alter table public.study_plan_generation_events enable row level security;

drop policy if exists "study_plan_gen_events_select_own" on public.study_plan_generation_events;
create policy "study_plan_gen_events_select_own"
on public.study_plan_generation_events
for select
to authenticated
using ((select auth.uid()) = user_id);

revoke all on public.study_plan_generation_events from anon, authenticated;
grant select on public.study_plan_generation_events to authenticated;
grant select, insert on public.study_plan_generation_events to service_role;

-- ============================================================
-- Atomic RPC: generate_study_plan_slot
-- ============================================================

create or replace function private.generate_study_plan_slot(
  p_period_start date,
  p_period_end date,
  p_diagnosis jsonb,
  p_preferences jsonb,
  p_goals jsonb,
  p_ai_model text,
  p_tasks jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_month_key text;
  v_count integer;
  v_version integer;
  v_new_plan_id uuid;
  v_task jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = 'P0001', message = 'STUDY_PLAN_ACCESS_DENIED';
  end if;

  v_month_key := to_char(pg_catalog.timezone('Asia/Shanghai', now()), 'YYYY-MM');

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':study-plan-gen:' || v_month_key, 0)
  );

  select count(*) into v_count
  from public.study_plan_generation_events
  where user_id = v_user_id
    and month_key = v_month_key;

  if v_count >= 5 then
    raise exception using errcode = 'P0001', message = 'STUDY_PLAN_MONTHLY_LIMIT';
  end if;

  update public.study_plans
  set status = 'replaced'
  where user_id = v_user_id
    and status = 'active';

  select coalesce(max(version), 0) + 1 into v_version
  from public.study_plans
  where user_id = v_user_id;

  insert into public.study_plans (
    user_id, version, status, period_start, period_end,
    diagnosis, preferences_snapshot, goals_snapshot, ai_model, generated_at
  ) values (
    v_user_id, v_version, 'active', p_period_start, p_period_end,
    p_diagnosis, p_preferences, p_goals, p_ai_model, now()
  )
  returning id into v_new_plan_id;

  if p_tasks is not null and pg_catalog.jsonb_array_length(p_tasks) > 0 then
    for v_task in select * from pg_catalog.jsonb_array_elements(p_tasks)
    loop
      insert into public.study_plan_tasks (
        plan_id, user_id, scheduled_date, task_type, source,
        question_id, focus_criteria, focus_error_tags, estimated_minutes, status
      ) values (
        v_new_plan_id,
        v_user_id,
        (v_task->>'scheduledDate')::date,
        v_task->>'taskType',
        coalesce(v_task->>'source', 'built_in'),
        nullif(v_task->>'questionId', ''),
        case when v_task->'focusCriteria' is not null
          then array(select jsonb_array_elements_text(v_task->'focusCriteria'))
          else '{}'::text[] end,
        case when v_task->'focusErrorTags' is not null
          then array(select jsonb_array_elements_text(v_task->'focusErrorTags'))
          else '{}'::text[] end,
        coalesce((v_task->>'estimatedMinutes')::integer, 40),
        'pending'
      );
    end loop;
  end if;

  insert into public.study_plan_generation_events (
    user_id, plan_id, generated_at, month_key
  ) values (
    v_user_id, v_new_plan_id, now(), v_month_key
  );

  return pg_catalog.jsonb_build_object(
    'planId', v_new_plan_id,
    'version', v_version,
    'monthKey', v_month_key,
    'usedCount', v_count + 1,
    'remainingCount', greatest(0, 5 - v_count - 1)
  );
end;
$$;

create or replace function public.generate_study_plan_slot(
  p_period_start date,
  p_period_end date,
  p_diagnosis jsonb,
  p_preferences jsonb,
  p_goals jsonb,
  p_ai_model text,
  p_tasks jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.generate_study_plan_slot(
    p_period_start, p_period_end, p_diagnosis, p_preferences, p_goals, p_ai_model, p_tasks
  );
$$;

revoke all on function private.generate_study_plan_slot(date, date, jsonb, jsonb, jsonb, text, jsonb) from public;
grant execute on function private.generate_study_plan_slot(date, date, jsonb, jsonb, jsonb, text, jsonb) to authenticated, service_role;

revoke all on function public.generate_study_plan_slot(date, date, jsonb, jsonb, jsonb, text, jsonb) from public;
grant execute on function public.generate_study_plan_slot(date, date, jsonb, jsonb, jsonb, text, jsonb) to authenticated, service_role;

-- ============================================================
-- Atomic RPC: complete_study_plan_task
-- ============================================================

create or replace function private.complete_study_plan_task(
  p_task_id uuid,
  p_writing_record_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_updated public.study_plan_tasks%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = 'P0001', message = 'STUDY_PLAN_ACCESS_DENIED';
  end if;

  update public.study_plan_tasks
  set status = 'completed',
      writing_record_id = p_writing_record_id,
      completed_at = now()
  where id = p_task_id
    and user_id = v_user_id
    and status in ('pending', 'in_progress')
  returning * into v_updated;

  if not found then
    raise exception using errcode = 'P0001', message = 'STUDY_PLAN_TASK_NOT_FOUND';
  end if;

  return pg_catalog.jsonb_build_object(
    'taskId', v_updated.id,
    'status', 'completed',
    'completedAt', v_updated.completed_at
  );
end;
$$;

create or replace function public.complete_study_plan_task(
  p_task_id uuid,
  p_writing_record_id text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.complete_study_plan_task(p_task_id, p_writing_record_id);
$$;

revoke all on function private.complete_study_plan_task(uuid, text) from public;
grant execute on function private.complete_study_plan_task(uuid, text) to authenticated, service_role;

revoke all on function public.complete_study_plan_task(uuid, text) from public;
grant execute on function public.complete_study_plan_task(uuid, text) to authenticated, service_role;
