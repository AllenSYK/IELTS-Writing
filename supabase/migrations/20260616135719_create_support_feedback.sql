create table if not exists public.support_feedback (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  subject text not null,
  message text not null,
  contact_email text,
  app_version text,
  platform text,
  os_version text,
  diagnostics jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'reviewing', 'resolved', 'closed')),
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_support_feedback_status_created_at on public.support_feedback(status, created_at desc);
create index if not exists idx_support_feedback_category_created_at on public.support_feedback(category, created_at desc);

drop trigger if exists trg_support_feedback_updated_at on public.support_feedback;
create trigger trg_support_feedback_updated_at
before update on public.support_feedback
for each row execute function public.set_updated_at();

alter table public.support_feedback enable row level security;

revoke all on public.support_feedback from anon, authenticated;
grant select, insert, update, delete on public.support_feedback to service_role;
