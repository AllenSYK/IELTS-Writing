alter table public.writing_task_uploads
  drop constraint if exists writing_task_uploads_task_type_check;

alter table public.writing_task_uploads
  add constraint writing_task_uploads_task_type_check
  check (task_type in ('unknown', 'task1', 'task2'));

drop index if exists public.idx_writing_task_uploads_user_hash;

create index if not exists idx_writing_task_uploads_user_hash
  on public.writing_task_uploads(user_id, content_hash, created_at desc);
