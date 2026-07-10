alter table public.chat_list_items
  add column if not exists assigned_user_id uuid references public.profiles (id) on delete set null;

create index if not exists chat_list_items_assigned_user_idx
  on public.chat_list_items (company_id, list_id, assigned_user_id)
  where deleted_at is null;
