-- B.2 advisor remediation: harden tenant isolation for timesheets and daily report logs.
-- Non-destructive: no data changes, no table/column drops, no truncation.

alter table public.daily_report_logs enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'daily_report_logs'
      and policyname = 'daily_report_logs_select_company_admin'
  ) then
    create policy daily_report_logs_select_company_admin
      on public.daily_report_logs
      for select
      to public
      using (
        exists (
          select 1
          from public.company_members cm
          where cm.company_id = daily_report_logs.company_id
            and cm.user_id = auth.uid()
            and lower(coalesce(cm.role, '')) in ('owner', 'admin', 'supervisor')
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
      and tablename = 'timesheets'
      and policyname = 'timesheets_company_membership_restrict'
  ) then
    create policy timesheets_company_membership_restrict
      on public.timesheets
      as restrictive
      for all
      to public
      using (
        user_id = auth.uid()
        or exists (
          select 1
          from public.company_members cm
          where cm.company_id = timesheets.company_id
            and cm.user_id = auth.uid()
            and lower(coalesce(cm.role, '')) in ('owner', 'admin', 'supervisor')
        )
      )
      with check (
        user_id = auth.uid()
        or exists (
          select 1
          from public.company_members cm
          where cm.company_id = timesheets.company_id
            and cm.user_id = auth.uid()
            and lower(coalesce(cm.role, '')) in ('owner', 'admin', 'supervisor')
        )
      );
  end if;
end $$;
