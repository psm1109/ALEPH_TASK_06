-- 카드 5 운영 적용용: Auth 사용자를 삭제하면 그 사용자의 다이어리 자료도 함께 삭제한다.
-- 실행 전 별도 시험 계정으로 내보내기를 완료하고, 운영 SQL Editor에서 한 번 실행한다.

begin;

alter table public.plan_versions drop constraint if exists plan_versions_user_id_fkey;
alter table public.plan_versions
  add constraint plan_versions_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.tasks drop constraint if exists tasks_user_id_fkey;
alter table public.tasks
  add constraint tasks_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.task_execution_logs drop constraint if exists task_execution_logs_user_id_fkey;
alter table public.task_execution_logs
  add constraint task_execution_logs_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.task_completion_events drop constraint if exists task_completion_events_user_id_fkey;
alter table public.task_completion_events
  add constraint task_completion_events_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.task_missed_days drop constraint if exists task_missed_days_user_id_fkey;
alter table public.task_missed_days
  add constraint task_missed_days_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.reflections drop constraint if exists reflections_user_id_fkey;
alter table public.reflections
  add constraint reflections_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

commit;
