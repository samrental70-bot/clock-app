-- Additive payroll settings update: allow pay dates to default to days after the period end.
-- Existing rows receive the default offset and no existing data is overwritten.

alter table public.payroll_settings
  add column if not exists pay_date_offset_days integer not null default 10;
