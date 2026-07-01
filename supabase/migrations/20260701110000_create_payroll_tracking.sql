-- OPERA.AI payroll tracking: company payroll settings and payment history.
-- Additive only. No existing data is deleted or overwritten.

create table if not exists public.payroll_settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  frequency text not null default 'alternate_friday',
  payroll_day text not null default 'friday',
  anchor_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint payroll_settings_frequency_check check (frequency in ('alternate_friday', 'weekly_friday', 'monthly')),
  constraint payroll_settings_day_check check (payroll_day in ('monday', 'tuesday', 'wednesday', 'thursday', 'friday'))
);

create unique index if not exists payroll_settings_company_unique
  on public.payroll_settings (company_id);

create index if not exists payroll_settings_company_updated_idx
  on public.payroll_settings (company_id, updated_at desc);

alter table public.payroll_settings enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'payroll_settings'
      and policyname = 'payroll_settings_select_admin'
  ) then
    create policy payroll_settings_select_admin
      on public.payroll_settings for select
      using (
        exists (
          select 1
          from public.company_members cm
          where cm.company_id = payroll_settings.company_id
            and cm.user_id = auth.uid()
            and lower(coalesce(cm.role, '')) in ('owner', 'supervisor')
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'payroll_settings'
      and policyname = 'payroll_settings_write_admin'
  ) then
    create policy payroll_settings_write_admin
      on public.payroll_settings for insert
      with check (
        exists (
          select 1
          from public.company_members cm
          where cm.company_id = payroll_settings.company_id
            and cm.user_id = auth.uid()
            and lower(coalesce(cm.role, '')) in ('owner', 'supervisor')
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'payroll_settings'
      and policyname = 'payroll_settings_update_admin'
  ) then
    create policy payroll_settings_update_admin
      on public.payroll_settings for update
      using (
        exists (
          select 1
          from public.company_members cm
          where cm.company_id = payroll_settings.company_id
            and cm.user_id = auth.uid()
            and lower(coalesce(cm.role, '')) in ('owner', 'supervisor')
        )
      )
      with check (
        exists (
          select 1
          from public.company_members cm
          where cm.company_id = payroll_settings.company_id
            and cm.user_id = auth.uid()
            and lower(coalesce(cm.role, '')) in ('owner', 'supervisor')
        )
      );
  end if;
end $$;

create table if not exists public.payroll_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  employee_id uuid not null,
  period_start date not null,
  period_end date not null,
  paid_amount numeric not null default 0 check (paid_amount >= 0),
  paid_date date not null,
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint payroll_payments_period_check check (period_start <= period_end)
);

create index if not exists payroll_payments_company_employee_period_idx
  on public.payroll_payments (company_id, employee_id, period_end desc, paid_date desc);

create index if not exists payroll_payments_company_deleted_idx
  on public.payroll_payments (company_id, deleted_at, period_end desc);

alter table public.payroll_payments enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'payroll_payments'
      and policyname = 'payroll_payments_select_admin'
  ) then
    create policy payroll_payments_select_admin
      on public.payroll_payments for select
      using (
        exists (
          select 1
          from public.company_members cm
          where cm.company_id = payroll_payments.company_id
            and cm.user_id = auth.uid()
            and lower(coalesce(cm.role, '')) in ('owner', 'supervisor')
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'payroll_payments'
      and policyname = 'payroll_payments_write_admin'
  ) then
    create policy payroll_payments_write_admin
      on public.payroll_payments for insert
      with check (
        exists (
          select 1
          from public.company_members cm
          where cm.company_id = payroll_payments.company_id
            and cm.user_id = auth.uid()
            and lower(coalesce(cm.role, '')) in ('owner', 'supervisor')
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'payroll_payments'
      and policyname = 'payroll_payments_update_admin'
  ) then
    create policy payroll_payments_update_admin
      on public.payroll_payments for update
      using (
        exists (
          select 1
          from public.company_members cm
          where cm.company_id = payroll_payments.company_id
            and cm.user_id = auth.uid()
            and lower(coalesce(cm.role, '')) in ('owner', 'supervisor')
        )
      )
      with check (
        exists (
          select 1
          from public.company_members cm
          where cm.company_id = payroll_payments.company_id
            and cm.user_id = auth.uid()
            and lower(coalesce(cm.role, '')) in ('owner', 'supervisor')
        )
      );
  end if;
end $$;

