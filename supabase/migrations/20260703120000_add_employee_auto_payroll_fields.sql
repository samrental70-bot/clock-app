-- OPERA.AI additive payroll automation fields for company member settings.
-- These columns are company-specific and do not overwrite existing data.

alter table public.company_members
  add column if not exists auto_payroll_enabled boolean not null default false,
  add column if not exists auto_payroll_start_date date,
  add column if not exists auto_payroll_amount numeric(12, 2) not null default 0;

create index if not exists company_members_auto_payroll_company_enabled_idx
  on public.company_members (company_id, auto_payroll_enabled, auto_payroll_start_date);
