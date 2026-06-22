-- ============================================================
-- Exam Writing Sets (考场题组)
-- ============================================================

create table if not exists public.exam_writing_sets (
  id uuid primary key default gen_random_uuid(),
  exam_date date,
  exam_session text default 'unknown'
    check (exam_session in ('morning', 'afternoon', 'evening', 'unknown')),
  exam_time_local time,
  exam_timezone text,
  exam_mode text not null default 'unknown'
    check (exam_mode in ('computer', 'paper', 'unknown')),
  exam_country text,
  exam_region text,
  exam_city text,
  venue_note text,
  source_type text not null default 'recalled'
    check (source_type in ('official', 'published_collection', 'recalled', 'curated')),
  source_reference text,
  reliability text not null default 'single_report'
    check (reliability in ('confirmed', 'multiple_reports', 'single_report', 'uncertain')),
  status text not null default 'draft'
    check (status in ('draft', 'review_pending', 'published', 'archived')),
  created_by uuid not null references auth.users(id) on delete cascade,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

create index if not exists idx_exam_writing_sets_date
  on public.exam_writing_sets(exam_date desc, exam_session);

create index if not exists idx_exam_writing_sets_status
  on public.exam_writing_sets(status);

create index if not exists idx_exam_writing_sets_mode
  on public.exam_writing_sets(exam_mode);

create trigger trg_exam_writing_sets_updated_at
before update on public.exam_writing_sets
for each row execute function public.set_updated_at();

alter table public.exam_writing_sets enable row level security;

drop policy if exists "exam_writing_sets_select_published" on public.exam_writing_sets;
create policy "exam_writing_sets_select_published"
on public.exam_writing_sets
for select
to authenticated
using (status = 'published');

revoke all on public.exam_writing_sets from anon, authenticated;
grant select on public.exam_writing_sets to authenticated;
grant select, insert, update, delete on public.exam_writing_sets to service_role;

-- ============================================================
-- Extend past_paper_questions with exam session metadata
-- ============================================================

alter table public.past_paper_questions
  add column if not exists exam_writing_set_id uuid references public.exam_writing_sets(id) on delete set null,
  add column if not exists exam_date date,
  add column if not exists exam_session text default 'unknown'
    check (exam_session in ('morning', 'afternoon', 'evening', 'unknown')),
  add column if not exists exam_time_local time,
  add column if not exists exam_timezone text,
  add column if not exists exam_mode text default 'unknown'
    check (exam_mode in ('computer', 'paper', 'unknown')),
  add column if not exists exam_country text,
  add column if not exists exam_region text,
  add column if not exists exam_city text,
  add column if not exists venue_note text,
  add column if not exists completeness text default 'complete'
    check (completeness in ('complete', 'mostly_complete', 'partial', 'summary_only', 'missing')),
  add column if not exists missing_fields jsonb not null default '[]'::jsonb,
  add column if not exists uncertainties jsonb not null default '[]'::jsonb,
  add column if not exists primary_topic text,
  add column if not exists secondary_topics text[] not null default '{}';

create index if not exists idx_past_paper_questions_exam_set
  on public.past_paper_questions(exam_writing_set_id)
  where exam_writing_set_id is not null;

create index if not exists idx_past_paper_questions_exam_date
  on public.past_paper_questions(exam_date desc, exam_session)
  where exam_date is not null;

create index if not exists idx_past_paper_questions_completeness
  on public.past_paper_questions(completeness);

create index if not exists idx_past_paper_questions_primary_topic
  on public.past_paper_questions(primary_topic)
  where primary_topic is not null;

-- ============================================================
-- Exam writing set import batches (for admin batch imports)
-- ============================================================

create table if not exists public.exam_import_batches (
  id uuid primary key default gen_random_uuid(),
  raw_text text not null,
  default_year integer,
  default_region text,
  default_mode text default 'unknown'
    check (default_mode in ('computer', 'paper', 'unknown')),
  ai_model text,
  ai_result jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'analyzing', 'completed', 'failed')),
  sets_created integer not null default 0,
  questions_created integer not null default 0,
  error_message text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_exam_import_batches_updated_at
before update on public.exam_import_batches
for each row execute function public.set_updated_at();

alter table public.exam_import_batches enable row level security;

revoke all on public.exam_import_batches from anon, authenticated;
grant select, insert, update on public.exam_import_batches to service_role;
