-- In-app notifications for owners/supervisors (run in Supabase SQL editor or via CLI).
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  recipient_user_id uuid not null,
  actor_user_id uuid,
  type text not null,
  title text not null,
  message text not null,
  read_at timestamptz,
  project_id text,
  project_name text,
  cost_centre text,
  related_timesheet_id uuid,
  related_folder text,
  item_count integer,
  created_at timestamptz not null default now()
);

create index if not exists notifications_recipient_created_idx
  on public.notifications (recipient_user_id, created_at desc);

create index if not exists notifications_recipient_unread_idx
  on public.notifications (recipient_user_id)
  where read_at is null;

alter table public.notifications enable row level security;

create policy "notifications_select_own"
  on public.notifications for select
  using (recipient_user_id = auth.uid());

create policy "notifications_update_own"
  on public.notifications for update
  using (recipient_user_id = auth.uid());

create policy "notifications_insert_company_member"
  on public.notifications for insert
  with check (
    company_id in (
      select cm.company_id from public.company_members cm where cm.user_id = auth.uid()
    )
  );
