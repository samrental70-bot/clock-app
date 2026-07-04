-- OPERA.AI chat lists and timesheet break persistence.
-- Additive/idempotent only. No existing data is deleted or overwritten.

alter table public.timesheets
  add column if not exists break_start_at timestamptz,
  add column if not exists break_end_at timestamptz,
  add column if not exists break_minutes integer not null default 0,
  add column if not exists break_note text;

alter table public.timesheet_change_requests
  add column if not exists requested_break_start_at timestamptz,
  add column if not exists requested_break_end_at timestamptz,
  add column if not exists requested_break_minutes integer not null default 0,
  add column if not exists requested_break_note text;

create table if not exists public.chat_lists (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  conversation_id uuid not null references public.chat_conversations (id) on delete cascade,
  title text not null,
  created_by uuid not null,
  pinned boolean not null default true,
  archived_at timestamptz,
  archived_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint chat_lists_title_check check (char_length(title) between 1 and 120)
);

create table if not exists public.chat_list_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  conversation_id uuid not null references public.chat_conversations (id) on delete cascade,
  list_id uuid not null references public.chat_lists (id) on delete cascade,
  item_number integer not null,
  text text not null,
  is_done boolean not null default false,
  completed_at timestamptz,
  completed_by uuid,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint chat_list_items_number_check check (item_number >= 1),
  constraint chat_list_items_text_check check (char_length(text) between 1 and 400)
);

create index if not exists timesheets_company_user_active_idx
  on public.timesheets (company_id, user_id, clock_in desc)
  where clock_out is null;

create index if not exists chat_lists_conversation_idx
  on public.chat_lists (company_id, conversation_id, pinned desc, updated_at desc)
  where archived_at is null;

create index if not exists chat_list_items_list_idx
  on public.chat_list_items (company_id, list_id, item_number);

create index if not exists chat_list_items_open_idx
  on public.chat_list_items (company_id, conversation_id, list_id)
  where deleted_at is null and is_done = false;

alter table public.chat_lists enable row level security;
alter table public.chat_list_items enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'chat_lists'
      and policyname = 'chat_lists_select_member'
  ) then
    create policy chat_lists_select_member
      on public.chat_lists
      for select
      to public
      using (
        exists (
          select 1
          from public.chat_conversation_members ccm
          where ccm.conversation_id = chat_lists.conversation_id
            and ccm.company_id = chat_lists.company_id
            and ccm.user_id = auth.uid()
            and ccm.left_at is null
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'chat_lists'
      and policyname = 'chat_lists_write_member'
  ) then
    create policy chat_lists_write_member
      on public.chat_lists
      for all
      to public
      using (
        exists (
          select 1
          from public.chat_conversation_members ccm
          where ccm.conversation_id = chat_lists.conversation_id
            and ccm.company_id = chat_lists.company_id
            and ccm.user_id = auth.uid()
            and ccm.left_at is null
        )
      )
      with check (
        exists (
          select 1
          from public.chat_conversation_members ccm
          where ccm.conversation_id = chat_lists.conversation_id
            and ccm.company_id = chat_lists.company_id
            and ccm.user_id = auth.uid()
            and ccm.left_at is null
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'chat_list_items'
      and policyname = 'chat_list_items_select_member'
  ) then
    create policy chat_list_items_select_member
      on public.chat_list_items
      for select
      to public
      using (
        exists (
          select 1
          from public.chat_conversation_members ccm
          where ccm.conversation_id = chat_list_items.conversation_id
            and ccm.company_id = chat_list_items.company_id
            and ccm.user_id = auth.uid()
            and ccm.left_at is null
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'chat_list_items'
      and policyname = 'chat_list_items_write_member'
  ) then
    create policy chat_list_items_write_member
      on public.chat_list_items
      for all
      to public
      using (
        exists (
          select 1
          from public.chat_conversation_members ccm
          where ccm.conversation_id = chat_list_items.conversation_id
            and ccm.company_id = chat_list_items.company_id
            and ccm.user_id = auth.uid()
            and ccm.left_at is null
        )
      )
      with check (
        exists (
          select 1
          from public.chat_conversation_members ccm
          where ccm.conversation_id = chat_list_items.conversation_id
            and ccm.company_id = chat_list_items.company_id
            and ccm.user_id = auth.uid()
            and ccm.left_at is null
        )
      );
  end if;
end $$;
