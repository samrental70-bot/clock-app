-- Links a pending-work subtask tagged "H" to its twin item in the real Home
-- Depot list, so ticking either copy keeps both in sync.
-- Run in the Supabase SQL editor for the DEVELOPMENT project first, verify,
-- then run the same in PRODUCTION.

alter table public.chat_list_items
  add column if not exists linked_item_id uuid;

create index if not exists chat_list_items_linked_item_id_idx
  on public.chat_list_items (linked_item_id);
