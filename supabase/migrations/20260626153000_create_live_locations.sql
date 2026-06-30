-- OPERA.AI live employee location tracking.
-- Additive schema for supervisor live map visibility while employees are clocked in.

create table if not exists public.live_locations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  user_id uuid,
  employee_id uuid references auth.users(id) on delete cascade,
  timesheet_id uuid references public.timesheets(id) on delete set null,
  latitude double precision,
  longitude double precision,
  accuracy double precision,
  status text,
  project_name text,
  cost_centre text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.live_locations add column if not exists employee_id uuid references auth.users(id) on delete cascade;
alter table public.live_locations add column if not exists timesheet_id uuid references public.timesheets(id) on delete set null;
alter table public.live_locations add column if not exists accuracy double precision;
alter table public.live_locations add column if not exists status text;
alter table public.live_locations add column if not exists project_name text;
alter table public.live_locations add column if not exists cost_centre text;
alter table public.live_locations add column if not exists created_at timestamptz not null default now();
alter table public.live_locations add column if not exists updated_at timestamptz not null default now();

create index if not exists live_locations_company_status_idx
  on public.live_locations(company_id, status, updated_at desc);

create index if not exists live_locations_employee_idx
  on public.live_locations(employee_id);

create unique index if not exists live_locations_company_employee_unique_idx
  on public.live_locations(company_id, employee_id)
  where employee_id is not null;

alter table public.live_locations enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'live_locations'
      and policyname = 'live_locations_company_member_select'
  ) then
    create policy "live_locations_company_member_select"
      on public.live_locations for select
      using (
        exists (
          select 1 from public.company_members cm
          where cm.company_id = live_locations.company_id
            and cm.user_id = auth.uid()
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'live_locations'
      and policyname = 'live_locations_employee_upsert_own'
  ) then
    create policy "live_locations_employee_upsert_own"
      on public.live_locations for all
      using (
        employee_id = auth.uid()
        and exists (
          select 1 from public.company_members cm
          where cm.company_id = live_locations.company_id
            and cm.user_id = auth.uid()
        )
      )
      with check (
        employee_id = auth.uid()
        and exists (
          select 1 from public.company_members cm
          where cm.company_id = live_locations.company_id
            and cm.user_id = auth.uid()
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'live_locations'
      and policyname = 'live_locations_supervisor_update_company'
  ) then
    create policy "live_locations_supervisor_update_company"
      on public.live_locations for update
      using (
        exists (
          select 1 from public.company_members cm
          where cm.company_id = live_locations.company_id
            and cm.user_id = auth.uid()
            and lower(coalesce(cm.role, '')) in ('owner', 'admin', 'manager', 'supervisor')
        )
      )
      with check (
        exists (
          select 1 from public.company_members cm
          where cm.company_id = live_locations.company_id
            and cm.user_id = auth.uid()
            and lower(coalesce(cm.role, '')) in ('owner', 'admin', 'manager', 'supervisor')
        )
      );
  end if;
end $$;
