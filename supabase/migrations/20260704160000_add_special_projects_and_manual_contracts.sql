-- Additive UI/data model support for special-project rates and manual contract tasks.
-- Safe for development and production rollout because it only adds columns.

alter table public.projects
  add column if not exists special_project_active boolean not null default false,
  add column if not exists special_hourly_rate numeric(12,2) not null default 0,
  add column if not exists special_project_notes text;

alter table public.cost_centres
  add column if not exists manual_contract_active boolean not null default false,
  add column if not exists manual_contract_fixed_amount numeric(12,2) not null default 0,
  add column if not exists manual_contract_notes text,
  add column if not exists manual_contract_start_date date,
  add column if not exists manual_contract_end_date date;

create index if not exists projects_special_project_active_idx
  on public.projects (company_id, special_project_active);

create index if not exists cost_centres_manual_contract_active_idx
  on public.cost_centres (company_id, manual_contract_active);
