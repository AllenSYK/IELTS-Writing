alter table public.support_feedback
  add column if not exists priority text not null default 'normal'
  check (priority in ('low', 'normal', 'high', 'urgent'));

update public.support_feedback
set priority = case
  when category in ('激活码问题', '设备绑定问题', 'AI批改失败') then 'high'
  when category in ('AI批改速度慢', '作文保存问题', '历史记录重复', '评分结果问题') then 'normal'
  else 'low'
end
where priority = 'normal';

create index if not exists idx_support_feedback_priority_created_at
on public.support_feedback(priority, created_at desc);
