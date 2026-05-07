create table if not exists public.project_list_items (
  id text primary key,
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null,
  storage_key text not null,
  kind text not null check (kind in ('task', 'material')),
  status text not null default 'active' check (status in ('active', 'completed')),
  text text not null default '',
  project_id text,
  project_name text,
  cost_centre text,
  image_data_url text,
  image_name text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists project_list_items_user_project_idx
  on public.project_list_items (company_id, user_id, kind, status, storage_key, created_at desc);

create index if not exists project_list_items_company_project_idx
  on public.project_list_items (company_id, project_id, kind, status, created_at desc);

alter table public.project_list_items enable row level security;

drop policy if exists "project_list_items_select_own_company" on public.project_list_items;
create policy "project_list_items_select_own_company"
  on public.project_list_items for select
  using (
    user_id = auth.uid()
    and company_id in (
      select cm.company_id from public.company_members cm where cm.user_id = auth.uid()
    )
  );

drop policy if exists "project_list_items_insert_own_company" on public.project_list_items;
create policy "project_list_items_insert_own_company"
  on public.project_list_items for insert
  with check (
    user_id = auth.uid()
    and company_id in (
      select cm.company_id from public.company_members cm where cm.user_id = auth.uid()
    )
  );

drop policy if exists "project_list_items_update_own_company" on public.project_list_items;
create policy "project_list_items_update_own_company"
  on public.project_list_items for update
  using (
    user_id = auth.uid()
    and company_id in (
      select cm.company_id from public.company_members cm where cm.user_id = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()
    and company_id in (
      select cm.company_id from public.company_members cm where cm.user_id = auth.uid()
    )
  );

drop policy if exists "project_list_items_delete_own_company" on public.project_list_items;
create policy "project_list_items_delete_own_company"
  on public.project_list_items for delete
  using (
    user_id = auth.uid()
    and company_id in (
      select cm.company_id from public.company_members cm where cm.user_id = auth.uid()
    )
  );
