-- Exact product name + price learned from an item photo, shown on the list item.
alter table public.chat_list_items
  add column if not exists hd_exact_name text,
  add column if not exists hd_price numeric;
