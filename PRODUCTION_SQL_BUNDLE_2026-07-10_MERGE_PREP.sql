-- OPERA.AI Production SQL Bundle -- prepared 2026-07-10, NOT YET EXECUTED
-- Contains only migrations confirmed outstanding vs production as of this date.
-- Verified additive-only (no DROP/DELETE/TRUNCATE/RESET/ALTER..DROP).
-- Excludes 20260707120000_create_orpl_customer_portal.sql (separate product, must never touch Clock App production).
-- Reference backup before this bundle: backups/production/OPERA_PROD_BACKUP_2026-07-10T13-46-05-621Z.json

-- ===== BEGIN 20260704160000_add_special_projects_and_manual_contracts.sql =====
-- Additive UI/data model support for special-project rates and manual contract tasks.
-- Safe for development and production rollout because it only adds columns.

alter table public.projects
  add column if not exists special_project_active boolean not null default false,
  add column if not exists special_hourly_rate numeric(12,2) not null default 0,
  add column if not exists special_project_notes text;

alter table public.cost_centres
  add column if not exists manual_contract_active boolean not null default false,
  add column if not exists manual_contract_fixed_amount numeric(12,2) not null default 0,
  add column if not exists manual_contract_notes text,
  add column if not exists manual_contract_start_date date,
  add column if not exists manual_contract_end_date date;

create index if not exists projects_special_project_active_idx
  on public.projects (company_id, special_project_active);

create index if not exists cost_centres_manual_contract_active_idx
  on public.cost_centres (company_id, manual_contract_active);

-- ===== END 20260704160000_add_special_projects_and_manual_contracts.sql =====

-- ===== BEGIN 20260707103000_add_chat_list_hierarchy.sql =====
alter table public.chat_list_items
  add column if not exists parent_item_id uuid references public.chat_list_items (id) on delete cascade,
  add column if not exists item_level integer not null default 0,
  add column if not exists child_order integer not null default 0,
  add column if not exists sort_order integer not null default 0;

update public.chat_list_items
set
  parent_item_id = null,
  item_level = 0,
  child_order = 0,
  sort_order = case
    when coalesce(sort_order, 0) > 0 then sort_order
    else coalesce(item_number, 0)
  end
where
  parent_item_id is distinct from null
  or coalesce(item_level, 0) <> 0
  or coalesce(child_order, 0) <> 0
  or coalesce(sort_order, 0) = 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'chat_list_items_level_check'
  ) then
    alter table public.chat_list_items
      add constraint chat_list_items_level_check check (item_level in (0, 1));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'chat_list_items_child_order_check'
  ) then
    alter table public.chat_list_items
      add constraint chat_list_items_child_order_check check (child_order >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'chat_list_items_sort_order_check'
  ) then
    alter table public.chat_list_items
      add constraint chat_list_items_sort_order_check check (sort_order >= 0);
  end if;
end
$$;

create index if not exists chat_list_items_parent_idx
  on public.chat_list_items (company_id, list_id, parent_item_id, child_order, sort_order);

create index if not exists chat_list_items_sort_idx
  on public.chat_list_items (company_id, list_id, sort_order, item_number, child_order);

-- ===== END 20260707103000_add_chat_list_hierarchy.sql =====

-- ===== BEGIN 20260707143000_add_chat_list_assignments.sql =====
alter table public.chat_list_items
  add column if not exists assigned_user_id uuid references public.profiles (id) on delete set null;

create index if not exists chat_list_items_assigned_user_idx
  on public.chat_list_items (company_id, list_id, assigned_user_id)
  where deleted_at is null;

-- ===== END 20260707143000_add_chat_list_assignments.sql =====

