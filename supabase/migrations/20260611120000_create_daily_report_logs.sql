-- B.2-fix-6 additive duplicate-send protection for daily supervisor reports.
-- Prepared for controller review. Do not run automatically from Codex.

create table if not exists public.daily_report_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  report_date date not null,
  channel text not null,
  recipient text not null,
  status text not null,
  sent_at timestamptz default now(),
  error text,
  provider_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, report_date, channel, recipient)
);

create index if not exists daily_report_logs_company_date_idx
  on public.daily_report_logs(company_id, report_date);
