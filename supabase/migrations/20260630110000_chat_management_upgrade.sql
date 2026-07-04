-- OPERA.AI chat management upgrade.
-- Additive only. No existing chat data is deleted or modified destructively.

alter table public.chat_conversations
  add column if not exists archived_by uuid;

alter table public.chat_messages
  add column if not exists message_type text not null default 'text',
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists deleted_by uuid;

create table if not exists public.chat_message_attachments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  conversation_id uuid not null references public.chat_conversations (id) on delete cascade,
  message_id uuid not null references public.chat_messages (id) on delete cascade,
  sender_user_id uuid not null,
  storage_bucket text not null default 'project-photos',
  storage_path text not null,
  public_url text,
  mime_type text,
  file_name text,
  file_size bigint,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_message_checklist_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  conversation_id uuid not null references public.chat_conversations (id) on delete cascade,
  message_id uuid not null references public.chat_messages (id) on delete cascade,
  text text not null,
  is_checked boolean not null default false,
  position integer not null default 0,
  checked_at timestamptz,
  checked_by uuid,
  created_at timestamptz not null default now(),
  constraint chat_checklist_item_text_check check (char_length(text) between 1 and 400)
);

create table if not exists public.chat_pins (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  conversation_id uuid not null references public.chat_conversations (id) on delete cascade,
  message_id uuid references public.chat_messages (id) on delete cascade,
  user_id uuid not null,
  pin_type text not null default 'conversation',
  created_at timestamptz not null default now(),
  unpinned_at timestamptz,
  constraint chat_pins_type_check check (pin_type in ('conversation', 'message', 'checklist'))
);

create index if not exists chat_attachments_message_idx
  on public.chat_message_attachments (message_id, created_at);

create index if not exists chat_attachments_conversation_idx
  on public.chat_message_attachments (company_id, conversation_id, created_at desc);

create index if not exists chat_checklist_message_idx
  on public.chat_message_checklist_items (message_id, position, created_at);

create index if not exists chat_checklist_conversation_idx
  on public.chat_message_checklist_items (company_id, conversation_id, created_at desc);

create unique index if not exists chat_conversation_pin_active_unique
  on public.chat_pins (company_id, user_id, conversation_id)
  where message_id is null and pin_type = 'conversation' and unpinned_at is null;

create unique index if not exists chat_message_pin_active_unique
  on public.chat_pins (company_id, user_id, message_id)
  where message_id is not null and unpinned_at is null;

create index if not exists chat_pins_user_active_idx
  on public.chat_pins (company_id, user_id, unpinned_at, created_at desc);

alter table public.chat_message_attachments enable row level security;
alter table public.chat_message_checklist_items enable row level security;
alter table public.chat_pins enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'chat_message_attachments'
      and policyname = 'chat_attachments_select_member'
  ) then
    create policy chat_attachments_select_member
      on public.chat_message_attachments
      for select
      to public
      using (
        exists (
          select 1
          from public.chat_conversation_members ccm
          where ccm.conversation_id = chat_message_attachments.conversation_id
            and ccm.company_id = chat_message_attachments.company_id
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
      and tablename = 'chat_message_checklist_items'
      and policyname = 'chat_checklist_select_member'
  ) then
    create policy chat_checklist_select_member
      on public.chat_message_checklist_items
      for select
      to public
      using (
        exists (
          select 1
          from public.chat_conversation_members ccm
          where ccm.conversation_id = chat_message_checklist_items.conversation_id
            and ccm.company_id = chat_message_checklist_items.company_id
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
      and tablename = 'chat_pins'
      and policyname = 'chat_pins_select_own'
  ) then
    create policy chat_pins_select_own
      on public.chat_pins
      for select
      to public
      using (user_id = auth.uid());
  end if;
end $$;
