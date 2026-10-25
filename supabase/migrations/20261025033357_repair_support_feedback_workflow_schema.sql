-- Repair deployed databases that have the original feedback table but missed
-- the priority and workflow migrations. This is additive and safe to rerun.
alter table public.support_feedback
  add column if not exists priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  add column if not exists user_id uuid,
  add column if not exists handled_by uuid,
  add column if not exists handled_at timestamptz,
  add column if not exists resolution_note text;

create index if not exists idx_support_feedback_user_created_at
  on public.support_feedback(user_id, created_at desc);
create index if not exists idx_support_feedback_status_priority_created_at
  on public.support_feedback(status, priority, created_at desc);

notify pgrst, 'reload schema';
