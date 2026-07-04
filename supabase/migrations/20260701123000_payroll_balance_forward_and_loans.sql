-- OPERA.AI payroll ledgers: balance brought forward and employee loan transactions.
-- Additive only. No existing data is deleted or overwritten.

create table if not exists public.payroll_balance_adjustments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  employee_id uuid not null,
  adjustment_type text not null,
  amount numeric not null,
  effective_date date not null,
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint payroll_balance_adjustments_type_check
    check (adjustment_type in ('brought_forward', 'manual_adjustment'))
);

create index if not exists payroll_balance_adjustments_company_employee_effective_idx
  on public.payroll_balance_adjustments (company_id, employee_id, effective_date desc, created_at desc);

create unique index if not exists payroll_balance_adjustments_company_employee_brought_forward_unique
  on public.payroll_balance_adjustments (company_id, employee_id)
  where deleted_at is null and adjustment_type = 'brought_forward';

alter table public.payroll_balance_adjustments enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'payroll_balance_adjustments'
      and policyname = 'payroll_balance_adjustments_select_admin'
  ) then
    create policy payroll_balance_adjustments_select_admin
      on public.payroll_balance_adjustments for select
      using (
        exists (
          select 1
          from public.company_members cm
          where cm.company_id = payroll_balance_adjustments.company_id
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
      and tablename = 'payroll_balance_adjustments'
      and policyname = 'payroll_balance_adjustments_write_admin'
  ) then
    create policy payroll_balance_adjustments_write_admin
      on public.payroll_balance_adjustments for insert
      with check (
        exists (
          select 1
          from public.company_members cm
          where cm.company_id = payroll_balance_adjustments.company_id
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
      and tablename = 'payroll_balance_adjustments'
      and policyname = 'payroll_balance_adjustments_update_admin'
  ) then
    create policy payroll_balance_adjustments_update_admin
      on public.payroll_balance_adjustments for update
      using (
        exists (
          select 1
          from public.company_members cm
          where cm.company_id = payroll_balance_adjustments.company_id
            and cm.user_id = auth.uid()
            and lower(coalesce(cm.role, '')) in ('owner', 'supervisor')
        )
      )
      with check (
        exists (
          select 1
          from public.company_members cm
          where cm.company_id = payroll_balance_adjustments.company_id
            and cm.user_id = auth.uid()
            and lower(coalesce(cm.role, '')) in ('owner', 'supervisor')
        )
      );
  end if;
end $$;

create table if not exists public.employee_loan_transactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  employee_id uuid not null,
  transaction_type text not null,
  amount numeric not null check (amount >= 0),
  transaction_date date not null,
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint employee_loan_transactions_type_check
    check (transaction_type in ('loan_given', 'loan_returned'))
);

create index if not exists employee_loan_transactions_company_employee_date_idx
  on public.employee_loan_transactions (company_id, employee_id, transaction_date desc, created_at desc);

create index if not exists employee_loan_transactions_company_deleted_idx
  on public.employee_loan_transactions (company_id, deleted_at, transaction_date desc);

alter table public.employee_loan_transactions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'employee_loan_transactions'
      and policyname = 'employee_loan_transactions_select_admin'
  ) then
    create policy employee_loan_transactions_select_admin
      on public.employee_loan_transactions for select
      using (
        exists (
          select 1
          from public.company_members cm
          where cm.company_id = employee_loan_transactions.company_id
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
      and tablename = 'employee_loan_transactions'
      and policyname = 'employee_loan_transactions_write_admin'
  ) then
    create policy employee_loan_transactions_write_admin
      on public.employee_loan_transactions for insert
      with check (
        exists (
          select 1
          from public.company_members cm
          where cm.company_id = employee_loan_transactions.company_id
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
      and tablename = 'employee_loan_transactions'
      and policyname = 'employee_loan_transactions_update_admin'
  ) then
    create policy employee_loan_transactions_update_admin
      on public.employee_loan_transactions for update
      using (
        exists (
          select 1
          from public.company_members cm
          where cm.company_id = employee_loan_transactions.company_id
            and cm.user_id = auth.uid()
            and lower(coalesce(cm.role, '')) in ('owner', 'supervisor')
        )
      )
      with check (
        exists (
          select 1
          from public.company_members cm
          where cm.company_id = employee_loan_transactions.company_id
            and cm.user_id = auth.uid()
            and lower(coalesce(cm.role, '')) in ('owner', 'supervisor')
        )
      );
  end if;
end $$;
