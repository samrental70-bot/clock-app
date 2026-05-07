create table if not exists public.project_media (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  project_id text,
  project_name text,
  cost_centre_id text,
  cost_centre text,
  user_id uuid not null,
  employee_name text,
  media_type text not null check (media_type in ('photo', 'video', 'receipt', 'document')),
  documentation_type text not null default 'daily_progress'
    check (documentation_type in ('before', 'after', 'daily_progress', 'receipt', 'video', 'clockout', 'document', 'other')),
  storage_bucket text not null default 'project-photos',
  storage_path text not null,
  public_url text,
  captured_at timestamptz not null default now(),
  uploaded_at timestamptz not null default now(),
  duration_seconds numeric,
  amount numeric,
  supplier text,
  receipt_status text,
  notes text,
  source text,
  related_timesheet_id uuid,
  location jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_media_company_captured_idx
  on public.project_media (company_id, captured_at desc);

create index if not exists project_media_project_idx
  on public.project_media (company_id, project_id, captured_at desc);

create index if not exists project_media_user_idx
  on public.project_media (company_id, user_id, captured_at desc);

create index if not exists project_media_type_idx
  on public.project_media (company_id, media_type, captured_at desc);

create index if not exists project_media_documentation_type_idx
  on public.project_media (company_id, documentation_type, captured_at desc);

create index if not exists project_media_cost_centre_idx
  on public.project_media (company_id, cost_centre, captured_at desc);

create unique index if not exists project_media_storage_unique_idx
  on public.project_media (company_id, storage_bucket, storage_path);

create or replace function public.set_project_media_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists project_media_set_updated_at on public.project_media;
create trigger project_media_set_updated_at
before update on public.project_media
for each row execute function public.set_project_media_updated_at();

alter table public.project_media enable row level security;

drop policy if exists "project_media_select_company_scope" on public.project_media;
create policy "project_media_select_company_scope"
  on public.project_media for select
  using (
    exists (
      select 1
      from public.company_members cm
      where cm.company_id = project_media.company_id
        and cm.user_id = auth.uid()
        and (
          project_media.user_id = auth.uid()
          or lower(coalesce(cm.role, '')) in ('owner', 'admin', 'supervisor')
        )
    )
  );

drop policy if exists "project_media_insert_own_company" on public.project_media;
create policy "project_media_insert_own_company"
  on public.project_media for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.company_members cm
      where cm.company_id = project_media.company_id
        and cm.user_id = auth.uid()
    )
  );

drop policy if exists "project_media_update_company_scope" on public.project_media;
create policy "project_media_update_company_scope"
  on public.project_media for update
  using (
    exists (
      select 1
      from public.company_members cm
      where cm.company_id = project_media.company_id
        and cm.user_id = auth.uid()
        and (
          project_media.user_id = auth.uid()
          or lower(coalesce(cm.role, '')) in ('owner', 'admin', 'supervisor')
        )
    )
  )
  with check (
    exists (
      select 1
      from public.company_members cm
      where cm.company_id = project_media.company_id
        and cm.user_id = auth.uid()
        and (
          project_media.user_id = auth.uid()
          or lower(coalesce(cm.role, '')) in ('owner', 'admin', 'supervisor')
        )
    )
  );

drop policy if exists "project_media_delete_company_scope" on public.project_media;
create policy "project_media_delete_company_scope"
  on public.project_media for delete
  using (
    exists (
      select 1
      from public.company_members cm
      where cm.company_id = project_media.company_id
        and cm.user_id = auth.uid()
        and (
          project_media.user_id = auth.uid()
          or lower(coalesce(cm.role, '')) in ('owner', 'admin', 'supervisor')
        )
    )
  );
