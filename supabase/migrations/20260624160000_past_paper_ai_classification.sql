-- Add classification tracking fields to past_paper_questions

alter table public.past_paper_questions
  add column if not exists classification_status text not null default 'unclassified'
    check (classification_status in ('unclassified', 'ai_classified', 'admin_confirmed', 'partial', 'failed')),
  add column if not exists classification_sources jsonb not null default '{}'::jsonb,
  add column if not exists ai_classified_at timestamptz,
  add column if not exists ai_classified_model text,
  add column if not exists ai_classification_confidence numeric(3,2),
  add column if not exists ai_classification_version integer not null default 0;

create index if not exists idx_past_paper_questions_classification
  on public.past_paper_questions(classification_status);
