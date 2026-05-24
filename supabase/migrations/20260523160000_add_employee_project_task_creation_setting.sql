-- B.1-fix-7: optional company setting for employee-created projects/tasks.
-- Safe to run manually in Supabase SQL Editor. Additive only.

alter table public.companies
  add column if not exists allow_employee_project_task_creation boolean not null default false;

comment on column public.companies.allow_employee_project_task_creation is
  'When true, employees may add projects and tasks from the Clock screen. Default false.';
