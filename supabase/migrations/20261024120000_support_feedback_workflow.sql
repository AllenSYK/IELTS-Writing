-- 反馈处理流程：关联提交用户，并支持后台处理记录
alter table public.support_feedback
  add column if not exists user_id uuid,
  add column if not exists handled_by uuid,
  add column if not exists handled_at timestamptz,
  add column if not exists resolution_note text;

create index if not exists idx_support_feedback_user_created_at
  on public.support_feedback(user_id, created_at desc);

create index if not exists idx_support_feedback_status_priority_created_at
  on public.support_feedback(status, priority, created_at desc);
