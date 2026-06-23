-- Add editing metadata and display control fields to past_paper_questions

alter table public.past_paper_questions
  add column if not exists source_note text,
  add column if not exists source_url text,
  add column if not exists source_date date,
  add column if not exists source_reliability text default 'uncertain'
    check (source_reliability in ('confirmed', 'multiple_reports', 'single_report', 'uncertain') or source_reliability is null),
  add column if not exists show_source_to_users boolean not null default false,
  add column if not exists internal_note text,
  add column if not exists user_note text,
  add column if not exists tags text[] not null default '{}',
  add column if not exists is_featured boolean not null default false,
  add column if not exists is_pinned boolean not null default false,
  add column if not exists is_recommended boolean not null default false,
  add column if not exists sort_weight integer not null default 0
    check (sort_weight >= -9999 and sort_weight <= 9999),
  add column if not exists is_visible boolean not null default true,
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

-- Expand frequency_source to include 'imported' and 'unknown'
alter table public.past_paper_questions
  drop constraint if exists past_paper_questions_frequency_source_check;

alter table public.past_paper_questions
  add constraint past_paper_questions_frequency_source_check
  check (frequency_source in ('admin', 'ai_suggested', 'imported', 'unknown'));

-- Expand source_type to include new values
alter table public.past_paper_questions
  drop constraint if exists past_paper_questions_source_type_check;

alter table public.past_paper_questions
  add constraint past_paper_questions_source_type_check
  check (source_type in ('official', 'published_collection', 'recalled', 'curated', 'official_public', 'published_book', 'exam_recall', 'platform_curated', 'user_submitted', 'other'));

-- Add indexes for new filterable fields
create index if not exists idx_past_paper_questions_featured
  on public.past_paper_questions(is_featured) where is_featured = true;

create index if not exists idx_past_paper_questions_visible
  on public.past_paper_questions(is_visible, status);

create index if not exists idx_past_paper_questions_tags
  on public.past_paper_questions using gin(tags);

-- Update the published select policy to also require is_visible
drop policy if exists "past_paper_questions_select_published" on public.past_paper_questions;
create policy "past_paper_questions_select_published"
on public.past_paper_questions
for select
to authenticated
using (status = 'published' and is_visible = true);
