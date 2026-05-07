create table if not exists public.timesheet_change_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null,
  employee_name text,
  employee_email text,
  request_type text not null check (request_type in ('manual_time', 'edit_time')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  timesheet_id uuid references public.timesheets (id) on delete set null,
  original_snapshot jsonb,
  requested_clock_in timestamptz not null,
  requested_clock_out timestamptz not null,
  requested_project_id text,
  requested_project_name text,
  requested_cost_centre text,
  reason text,
  supervisor_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists timesheet_change_requests_company_status_idx
  on public.timesheet_change_requests (company_id, status, created_at desc);

create index if not exists timesheet_change_requests_user_idx
  on public.timesheet_change_requests (company_id, user_id, created_at desc);

create index if not exists timesheet_change_requests_timesheet_idx
  on public.timesheet_change_requests (timesheet_id);

create or replace function public.set_timesheet_change_requests_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists timesheet_change_requests_set_updated_at on public.timesheet_change_requests;
create trigger timesheet_change_requests_set_updated_at
before update on public.timesheet_change_requests
for each row execute function public.set_timesheet_change_requests_updated_at();

alter table public.timesheet_change_requests enable row level security;

drop policy if exists "timesheet_change_requests_select_company_scope" on public.timesheet_change_requests;
create policy "timesheet_change_requests_select_company_scope"
  on public.timesheet_change_requests for select
  using (
    exists (
      select 1
      from public.company_members cm
      where cm.company_id = timesheet_change_requests.company_id
        and cm.user_id = auth.uid()
        and (
          timesheet_change_requests.user_id = auth.uid()
          or lower(coalesce(cm.role, '')) in ('owner', 'admin', 'supervisor')
        )
    )
  );

drop policy if exists "timesheet_change_requests_insert_own" on public.timesheet_change_requests;
create policy "timesheet_change_requests_insert_own"
  on public.timesheet_change_requests for insert
  with check (
    user_id = auth.uid()
    and status = 'pending'
    and exists (
      select 1
      from public.company_members cm
      where cm.company_id = timesheet_change_requests.company_id
        and cm.user_id = auth.uid()
    )
  );

drop policy if exists "timesheet_change_requests_update_supervisor" on public.timesheet_change_requests;
create policy "timesheet_change_requests_update_supervisor"
  on public.timesheet_change_requests for update
  using (
    exists (
      select 1
      from public.company_members cm
      where cm.company_id = timesheet_change_requests.company_id
        and cm.user_id = auth.uid()
        and lower(coalesce(cm.role, '')) in ('owner', 'admin', 'supervisor')
    )
  )
  with check (
    exists (
      select 1
      from public.company_members cm
      where cm.company_id = timesheet_change_requests.company_id
        and cm.user_id = auth.uid()
        and lower(coalesce(cm.role, '')) in ('owner', 'admin', 'supervisor')
    )
  );
