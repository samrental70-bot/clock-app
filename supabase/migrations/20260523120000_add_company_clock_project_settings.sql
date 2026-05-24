alter table public.companies
  add column if not exists auto_clock_out_time text not null default '00:00',
  add column if not exists assign_all_projects_to_all_employees boolean not null default true,
  add column if not exists assign_all_tasks_to_all_projects boolean not null default true;

comment on column public.companies.auto_clock_out_time is
  'Company local wall-clock time in HH:MM for automatic clock-out. Default is 00:00 midnight.';
comment on column public.companies.assign_all_projects_to_all_employees is
  'When true, every active employee can see/select every active company project.';
comment on column public.companies.assign_all_tasks_to_all_projects is
  'When true, every active task/cost centre is available under every active project.';
