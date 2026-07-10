-- OPERA.AI B.2/V3/V4 additive production SQL bundle.
-- Prepared for manual Supabase production execution after Controller approval.
-- Generated from the production DB precheck and committed develop migrations.
--
-- Target before execution:
-- - Production Supabase ref: ...evhyjm
-- - Development Supabase ref: ...jjwbut
--
-- Safety intent:
-- - Additive and idempotent where PostgreSQL supports it.
-- - Existing production rows should be preserved.
-- - No Supabase Storage files are touched.
-- - Review all NOTICE output from the preflight section before continuing.

-- ============================================================
-- PREFLIGHT: read-only table existence and row-count inventory
-- ============================================================
do $$
declare
  table_name text;
  row_count bigint;
  tracked_tables text[] := array[
    'companies',
    'company_members',
    'profiles',
    'projects',
    'cost_centres',
    'timesheets',
    'project_media',
    'notifications',
    'chat_conversations',
    'chat_members',
    'chat_conversation_members',
    'chat_messages',
    'live_locations',
    'daily_report_logs',
    'employee_pay_rates'
  ];
begin
  raise notice 'OPERA.AI production preflight table inventory';

  foreach table_name in array tracked_tables loop
    if to_regclass(format('public.%I', table_name)) is null then
      raise notice '%: missing', table_name;
    else
      execute format('select count(*) from public.%I', table_name) into row_count;
      raise notice '%: % rows', table_name, row_count;
    end if;
  end loop;

  if to_regclass('public.live_locations') is not null then
    execute $dup$
      select count(*)
      from (
        select company_id, employee_id
        from public.live_locations
        where employee_id is not null
        group by company_id, employee_id
        having count(*) > 1
      ) duplicate_live_location_keys
    $dup$ into row_count;
    raise notice 'live_locations duplicate company/employee keys: %', row_count;
    raise notice 'If duplicate company/employee keys are greater than 0, review before creating the unique live location index.';
  end if;
end $$;

-- ============================================================
-- AI fields on project_media
-- Source: 20260507210000_add_ai_fields_to_project_media.sql
-- ============================================================
alter table public.project_media
  add column if not exists ai_extracted_json jsonb,
  add column if not exists ai_tags text[] not null default '{}',
  add column if not exists ai_category text,
  add column if not exists ai_summary text,
  add column if not exists ai_review_status text,
  add column if not exists ai_processed_at timestamptz,
  add column if not exists ai_confidence numeric,
  add column if not exists ai_error text;

create index if not exists project_media_ai_category_idx
  on public.project_media (company_id, ai_category)
  where ai_category is not null;

create index if not exists project_media_ai_processed_idx
  on public.project_media (company_id, ai_processed_at desc)
  where ai_processed_at is not null;

create index if not exists project_media_ai_tags_idx
  on public.project_media using gin (ai_tags);

-- ============================================================
-- employee_pay_rates
-- Source: 20260610120000_add_b2_pay_rates_and_receipt_ocr_fields.sql
-- ============================================================
create table if not exists public.employee_pay_rates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  employee_id uuid not null,
  hourly_rate numeric not null check (hourly_rate >= 0),
  effective_date date not null,
  created_at timestamptz not null default now(),
  created_by uuid,
  note text
);

create index if not exists idx_employee_pay_rates_company_employee_effective
  on public.employee_pay_rates (company_id, employee_id, effective_date desc);

create unique index if not exists employee_pay_rates_company_employee_effective_unique
  on public.employee_pay_rates (company_id, employee_id, effective_date);

alter table public.employee_pay_rates enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'employee_pay_rates'
      and policyname = 'employee_pay_rates_select_company_scope'
  ) then
    create policy "employee_pay_rates_select_company_scope"
      on public.employee_pay_rates for select
      using (
        exists (
          select 1
          from public.company_members cm
          where cm.company_id = employee_pay_rates.company_id
            and cm.user_id = auth.uid()
            and (
              employee_pay_rates.employee_id = auth.uid()
              or lower(coalesce(cm.role, '')) in ('owner', 'admin', 'supervisor')
            )
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'employee_pay_rates'
      and policyname = 'employee_pay_rates_admin_insert'
  ) then
    create policy "employee_pay_rates_admin_insert"
      on public.employee_pay_rates for insert
      with check (
        exists (
          select 1
          from public.company_members cm
          where cm.company_id = employee_pay_rates.company_id
            and cm.user_id = auth.uid()
            and lower(coalesce(cm.role, '')) in ('owner', 'admin', 'supervisor')
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'employee_pay_rates'
      and policyname = 'employee_pay_rates_admin_update'
  ) then
    create policy "employee_pay_rates_admin_update"
      on public.employee_pay_rates for update
      using (
        exists (
          select 1
          from public.company_members cm
          where cm.company_id = employee_pay_rates.company_id
            and cm.user_id = auth.uid()
            and lower(coalesce(cm.role, '')) in ('owner', 'admin', 'supervisor')
        )
      )
      with check (
        exists (
          select 1
          from public.company_members cm
          where cm.company_id = employee_pay_rates.company_id
            and cm.user_id = auth.uid()
            and lower(coalesce(cm.role, '')) in ('owner', 'admin', 'supervisor')
        )
      );
  end if;
end $$;

-- ============================================================
-- Receipt OCR fields on project_media
-- Source: 20260610120000_add_b2_pay_rates_and_receipt_ocr_fields.sql
-- ============================================================
alter table public.project_media
  add column if not exists receipt_supplier text,
  add column if not exists receipt_date date,
  add column if not exists receipt_subtotal numeric,
  add column if not exists receipt_hst numeric,
  add column if not exists receipt_total numeric,
  add column if not exists receipt_currency text default 'CAD',
  add column if not exists receipt_material_category text,
  add column if not exists receipt_material_type text,
  add column if not exists receipt_ocr_status text default 'pending',
  add column if not exists receipt_ocr_confidence numeric,
  add column if not exists receipt_reviewed_at timestamptz,
  add column if not exists receipt_reviewed_by uuid,
  add column if not exists receipt_source text default 'manual';

create index if not exists project_media_receipt_date_idx
  on public.project_media (company_id, receipt_date desc)
  where media_type = 'receipt';

create index if not exists project_media_receipt_material_category_idx
  on public.project_media (company_id, receipt_material_category)
  where media_type = 'receipt';

-- ============================================================
-- daily_report_logs
-- Source: 20260611120000_create_daily_report_logs.sql
-- ============================================================
create table if not exists public.daily_report_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  report_date date not null,
  channel text not null,
  recipient text not null,
  status text not null,
  sent_at timestamptz default now(),
  error text,
  provider_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, report_date, channel, recipient)
);

create index if not exists daily_report_logs_company_date_idx
  on public.daily_report_logs(company_id, report_date);

-- ============================================================
-- daily report RLS hardening
-- Source: 20260615110000_harden_daily_report_rls.sql
-- ============================================================
alter table public.daily_report_logs enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'daily_report_logs'
      and policyname = 'daily_report_logs_select_company_admin'
  ) then
    create policy daily_report_logs_select_company_admin
      on public.daily_report_logs
      for select
      to public
      using (
        exists (
          select 1
          from public.company_members cm
          where cm.company_id = daily_report_logs.company_id
            and cm.user_id = auth.uid()
            and lower(coalesce(cm.role, '')) in ('owner', 'admin', 'supervisor')
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'timesheets'
      and policyname = 'timesheets_company_membership_restrict'
  ) then
    create policy timesheets_company_membership_restrict
      on public.timesheets
      as restrictive
      for all
      to public
      using (
        user_id = auth.uid()
        or exists (
          select 1
          from public.company_members cm
          where cm.company_id = timesheets.company_id
            and cm.user_id = auth.uid()
            and lower(coalesce(cm.role, '')) in ('owner', 'admin', 'supervisor')
        )
      )
      with check (
        user_id = auth.uid()
        or exists (
          select 1
          from public.company_members cm
          where cm.company_id = timesheets.company_id
            and cm.user_id = auth.uid()
            and lower(coalesce(cm.role, '')) in ('owner', 'admin', 'supervisor')
        )
      );
  end if;
end $$;

-- ============================================================
-- Company chat tables
-- Source: 20260626120000_create_company_chat.sql
-- ============================================================
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

-- ============================================================
-- live_locations additive columns / table-safe update
-- Source: 20260626153000_create_live_locations.sql
-- ============================================================
create table if not exists public.live_locations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  user_id uuid,
  employee_id uuid references auth.users(id) on delete cascade,
  timesheet_id uuid references public.timesheets(id) on delete set null,
  latitude double precision,
  longitude double precision,
  accuracy double precision,
  status text,
  project_name text,
  cost_centre text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.live_locations add column if not exists employee_id uuid references auth.users(id) on delete cascade;
alter table public.live_locations add column if not exists timesheet_id uuid references public.timesheets(id) on delete set null;
alter table public.live_locations add column if not exists accuracy double precision;
alter table public.live_locations add column if not exists status text;
alter table public.live_locations add column if not exists project_name text;
alter table public.live_locations add column if not exists cost_centre text;
alter table public.live_locations add column if not exists created_at timestamptz not null default now();
alter table public.live_locations add column if not exists updated_at timestamptz not null default now();

create index if not exists live_locations_company_status_idx
  on public.live_locations(company_id, status, updated_at desc);

create index if not exists live_locations_employee_idx
  on public.live_locations(employee_id);

create unique index if not exists live_locations_company_employee_unique_idx
  on public.live_locations(company_id, employee_id)
  where employee_id is not null;

alter table public.live_locations enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'live_locations'
      and policyname = 'live_locations_company_member_select'
  ) then
    create policy "live_locations_company_member_select"
      on public.live_locations for select
      using (
        exists (
          select 1 from public.company_members cm
          where cm.company_id = live_locations.company_id
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
      and tablename = 'live_locations'
      and policyname = 'live_locations_employee_upsert_own'
  ) then
    create policy "live_locations_employee_upsert_own"
      on public.live_locations for all
      using (
        employee_id = auth.uid()
        and exists (
          select 1 from public.company_members cm
          where cm.company_id = live_locations.company_id
            and cm.user_id = auth.uid()
        )
      )
      with check (
        employee_id = auth.uid()
        and exists (
          select 1 from public.company_members cm
          where cm.company_id = live_locations.company_id
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
      and tablename = 'live_locations'
      and policyname = 'live_locations_supervisor_update_company'
  ) then
    create policy "live_locations_supervisor_update_company"
      on public.live_locations for update
      using (
        exists (
          select 1 from public.company_members cm
          where cm.company_id = live_locations.company_id
            and cm.user_id = auth.uid()
            and lower(coalesce(cm.role, '')) in ('owner', 'admin', 'manager', 'supervisor')
        )
      )
      with check (
        exists (
          select 1 from public.company_members cm
          where cm.company_id = live_locations.company_id
            and cm.user_id = auth.uid()
            and lower(coalesce(cm.role, '')) in ('owner', 'admin', 'manager', 'supervisor')
        )
      );
  end if;
end $$;

-- ============================================================
-- notification column hardening
-- Production already has notification rows. Add nullable compatibility
-- columns only; do not rewrite existing notification data.
-- ============================================================
alter table public.notifications
  add column if not exists message text,
  add column if not exists body text,
  add column if not exists entity_type text,
  add column if not exists entity_id uuid,
  add column if not exists read_at timestamptz,
  add column if not exists is_read boolean not null default false,
  add column if not exists actor_user_id uuid,
  add column if not exists project_id text,
  add column if not exists project_name text,
  add column if not exists cost_centre text,
  add column if not exists related_timesheet_id uuid,
  add column if not exists related_folder text,
  add column if not exists item_count integer;

create index if not exists notifications_recipient_created_idx
  on public.notifications (recipient_user_id, created_at desc);

create index if not exists notifications_recipient_unread_idx
  on public.notifications (recipient_user_id)
  where read_at is null;

alter table public.notifications enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'notifications'
      and policyname = 'notifications_select_own'
  ) then
    create policy "notifications_select_own"
      on public.notifications for select
      using (recipient_user_id = auth.uid());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'notifications'
      and policyname = 'notifications_update_own'
  ) then
    create policy "notifications_update_own"
      on public.notifications for update
      using (recipient_user_id = auth.uid());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'notifications'
      and policyname = 'notifications_insert_company_member'
  ) then
    create policy "notifications_insert_company_member"
      on public.notifications for insert
      with check (
        company_id in (
          select cm.company_id from public.company_members cm where cm.user_id = auth.uid()
        )
      );
  end if;
end $$;

-- ============================================================
-- POSTFLIGHT: schema verification queries
-- ============================================================
do $$
declare
  missing_count integer;
begin
  raise notice 'OPERA.AI production postflight schema verification';

  select count(*) into missing_count
  from (
    values
      ('project_media', 'ai_extracted_json'),
      ('project_media', 'ai_tags'),
      ('project_media', 'ai_category'),
      ('project_media', 'ai_summary'),
      ('project_media', 'ai_review_status'),
      ('project_media', 'ai_processed_at'),
      ('project_media', 'ai_confidence'),
      ('project_media', 'ai_error'),
      ('project_media', 'receipt_supplier'),
      ('project_media', 'receipt_date'),
      ('project_media', 'receipt_subtotal'),
      ('project_media', 'receipt_hst'),
      ('project_media', 'receipt_total'),
      ('project_media', 'receipt_currency'),
      ('project_media', 'receipt_material_category'),
      ('project_media', 'receipt_material_type'),
      ('project_media', 'receipt_ocr_status'),
      ('project_media', 'receipt_ocr_confidence'),
      ('project_media', 'receipt_reviewed_at'),
      ('project_media', 'receipt_reviewed_by'),
      ('project_media', 'receipt_source'),
      ('live_locations', 'timesheet_id'),
      ('live_locations', 'created_at'),
      ('notifications', 'body'),
      ('notifications', 'entity_type'),
      ('notifications', 'entity_id')
  ) as expected(table_name, column_name)
  where not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = expected.table_name
      and c.column_name = expected.column_name
  );
  raise notice 'missing expected columns after bundle: %', missing_count;

  select count(*) into missing_count
  from (
    values
      ('employee_pay_rates'),
      ('daily_report_logs'),
      ('chat_conversations'),
      ('chat_conversation_members'),
      ('chat_messages'),
      ('live_locations')
  ) as expected(table_name)
  where to_regclass(format('public.%I', expected.table_name)) is null;
  raise notice 'missing expected tables after bundle: %', missing_count;
end $$;

select
  table_name,
  column_name,
  data_type
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'project_media' and column_name like 'ai_%')
    or (table_name = 'project_media' and column_name like 'receipt_%')
    or table_name in ('employee_pay_rates', 'daily_report_logs', 'chat_conversations', 'chat_conversation_members', 'chat_messages', 'live_locations')
    or (table_name = 'notifications' and column_name in ('body', 'entity_type', 'entity_id', 'message', 'read_at', 'is_read'))
  )
order by table_name, column_name;

-- ============================================================
-- Rollback notes
-- ============================================================
-- No rollback statements are included in this bundle.
-- If a problem occurs, stop promotion and restore from the approved
-- Supabase backup/export strategy for production. Schema removal should
-- only be prepared as a separate Controller-reviewed operation.
