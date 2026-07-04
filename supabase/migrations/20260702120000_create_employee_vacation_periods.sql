-- B.2 additive vacation periods for timesheet and payroll visibility.
-- No existing data is deleted or modified destructively.

create table if not exists public.employee_vacation_periods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  employee_id uuid not null,
  start_date date not null,
  end_date date not null,
  reason text not null default '',
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_vacation_periods_range_check check (end_date >= start_date),
  constraint employee_vacation_periods_reason_check check (char_length(reason) between 1 and 500)
);

create index if not exists employee_vacation_periods_company_employee_start_idx
  on public.employee_vacation_periods (company_id, employee_id, start_date desc, end_date desc);

create index if not exists employee_vacation_periods_company_range_idx
  on public.employee_vacation_periods (company_id, start_date, end_date);

alter table public.employee_vacation_periods enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'employee_vacation_periods'
      and policyname = 'employee_vacation_periods_select_company_member'
  ) then
    create policy employee_vacation_periods_select_company_member
      on public.employee_vacation_periods
      for select
      to public
      using (
        exists (
          select 1
          from public.company_members cm
          where cm.company_id = employee_vacation_periods.company_id
            and cm.user_id = auth.uid()
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'employee_vacation_periods'
      and policyname = 'employee_vacation_periods_insert_owner_self'
  ) then
    create policy employee_vacation_periods_insert_owner_self
      on public.employee_vacation_periods
      for insert
      to public
      with check (
        exists (
          select 1
          from public.company_members cm
          where cm.company_id = employee_vacation_periods.company_id
            and cm.user_id = auth.uid()
        )
        and (
          employee_vacation_periods.employee_id = auth.uid()
          or exists (
            select 1
            from public.company_members cm
            where cm.company_id = employee_vacation_periods.company_id
              and cm.user_id = auth.uid()
              and lower(coalesce(cm.role, '')) in ('owner', 'supervisor')
          )
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'employee_vacation_periods'
      and policyname = 'employee_vacation_periods_update_owner_self'
  ) then
    create policy employee_vacation_periods_update_owner_self
      on public.employee_vacation_periods
      for update
      to public
      using (
        exists (
          select 1
          from public.company_members cm
          where cm.company_id = employee_vacation_periods.company_id
            and cm.user_id = auth.uid()
        )
        and (
          employee_vacation_periods.employee_id = auth.uid()
          or exists (
            select 1
            from public.company_members cm
            where cm.company_id = employee_vacation_periods.company_id
              and cm.user_id = auth.uid()
              and lower(coalesce(cm.role, '')) in ('owner', 'supervisor')
          )
        )
      )
      with check (
        exists (
          select 1
          from public.company_members cm
          where cm.company_id = employee_vacation_periods.company_id
            and cm.user_id = auth.uid()
        )
        and (
          employee_vacation_periods.employee_id = auth.uid()
          or exists (
            select 1
            from public.company_members cm
            where cm.company_id = employee_vacation_periods.company_id
              and cm.user_id = auth.uid()
              and lower(coalesce(cm.role, '')) in ('owner', 'supervisor')
          )
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'employee_vacation_periods'
      and policyname = 'employee_vacation_periods_delete_owner_self'
  ) then
    create policy employee_vacation_periods_delete_owner_self
      on public.employee_vacation_periods
      for delete
      to public
      using (
        exists (
          select 1
          from public.company_members cm
          where cm.company_id = employee_vacation_periods.company_id
            and cm.user_id = auth.uid()
        )
        and (
          employee_vacation_periods.employee_id = auth.uid()
          or exists (
            select 1
            from public.company_members cm
            where cm.company_id = employee_vacation_periods.company_id
              and cm.user_id = auth.uid()
              and lower(coalesce(cm.role, '')) in ('owner', 'supervisor')
          )
        )
      );
  end if;
end $$;
