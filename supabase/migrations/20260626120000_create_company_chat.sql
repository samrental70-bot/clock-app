-- B.2 chat foundation: company-scoped conversations, members, and messages.
-- Additive only. No existing data is deleted or modified destructively.

create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  type text not null default 'group',
  name text not null default '',
  is_default boolean not null default false,
  direct_key text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz,
  archived_at timestamptz,
  constraint chat_conversations_type_check check (type in ('company', 'group', 'direct'))
);

create table if not exists public.chat_conversation_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  conversation_id uuid not null references public.chat_conversations (id) on delete cascade,
  user_id uuid not null,
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  last_read_at timestamptz,
  constraint chat_conversation_members_role_check check (role in ('owner', 'member'))
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  conversation_id uuid not null references public.chat_conversations (id) on delete cascade,
  sender_user_id uuid not null,
  body text not null,
  client_id text,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  constraint chat_messages_body_length_check check (char_length(body) between 1 and 2000)
);

create unique index if not exists chat_company_default_unique
  on public.chat_conversations (company_id)
  where type = 'company' and is_default = true;

create unique index if not exists chat_direct_key_unique
  on public.chat_conversations (company_id, direct_key)
  where type = 'direct' and direct_key is not null;

create unique index if not exists chat_member_unique
  on public.chat_conversation_members (conversation_id, user_id);

create unique index if not exists chat_message_client_unique
  on public.chat_messages (conversation_id, client_id)
  where client_id is not null;

create index if not exists chat_conversations_company_recent_idx
  on public.chat_conversations (company_id, (coalesce(last_message_at, updated_at)) desc);

create index if not exists chat_members_user_idx
  on public.chat_conversation_members (company_id, user_id, left_at);

create index if not exists chat_members_conversation_idx
  on public.chat_conversation_members (conversation_id, left_at);

create index if not exists chat_messages_conversation_created_idx
  on public.chat_messages (conversation_id, created_at desc);

alter table public.chat_conversations enable row level security;
alter table public.chat_conversation_members enable row level security;
alter table public.chat_messages enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'chat_conversations'
      and policyname = 'chat_conversations_select_member'
  ) then
    create policy chat_conversations_select_member
      on public.chat_conversations
      for select
      to public
      using (
        exists (
          select 1
          from public.chat_conversation_members ccm
          where ccm.conversation_id = chat_conversations.id
            and ccm.company_id = chat_conversations.company_id
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
      and tablename = 'chat_conversation_members'
      and policyname = 'chat_members_select_company_member'
  ) then
    create policy chat_members_select_company_member
      on public.chat_conversation_members
      for select
      to public
      using (
        exists (
          select 1
          from public.company_members cm
          where cm.company_id = chat_conversation_members.company_id
            and cm.user_id = auth.uid()
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'chat_messages'
      and policyname = 'chat_messages_select_member'
  ) then
    create policy chat_messages_select_member
      on public.chat_messages
      for select
      to public
      using (
        exists (
          select 1
          from public.chat_conversation_members ccm
          where ccm.conversation_id = chat_messages.conversation_id
            and ccm.company_id = chat_messages.company_id
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
      and tablename = 'chat_messages'
      and policyname = 'chat_messages_insert_member'
  ) then
    create policy chat_messages_insert_member
      on public.chat_messages
      for insert
      to public
      with check (
        sender_user_id = auth.uid()
        and exists (
          select 1
          from public.chat_conversation_members ccm
          where ccm.conversation_id = chat_messages.conversation_id
            and ccm.company_id = chat_messages.company_id
            and ccm.user_id = auth.uid()
            and ccm.left_at is null
        )
      );
  end if;
end $$;
