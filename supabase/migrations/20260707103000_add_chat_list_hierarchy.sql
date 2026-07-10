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
