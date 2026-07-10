-- OPERA.AI payroll/chat/clock additive production SQL bundle.
-- Prepared for manual Supabase production execution after Controller approval.
-- Source migrations are the new develop-side schema changes that still require production planning.
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
    'chat_message_attachments',
    'chat_message_checklist_items',
    'chat_pins',
    'chat_lists',
    'chat_list_items',
    'live_locations',
    'daily_report_logs',
    'employee_pay_rates',
    'payroll_settings',
    'payroll_payments',
    'payroll_balance_adjustments',
    'employee_loan_transactions',
    'employee_vacation_periods'
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
    execute $$
      select count(*)
      from (
        select company_id, employee_id
        from public.live_locations
        where employee_id is not null
        group by company_id, employee_id
        having count(*) > 1
      ) duplicate_live_location_keys
    $$ into row_count;
    raise notice 'live_locations duplicate company/employee keys: %', row_count;
    raise notice 'If duplicate company/employee keys are greater than 0, review before creating the unique live location index.';
  end if;
end $$;


-- ============================================================
-- Source: 20260630110000_chat_management_upgrade.sql
-- ============================================================
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

-- ============================================================
-- Source: 20260630123000_chat_lists_and_timesheet_breaks.sql
-- ============================================================
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

-- ============================================================
-- Source: 20260701110000_create_payroll_tracking.sql
-- ============================================================
-- OPERA.AI payroll tracking: company payroll settings and payment history.
-- Additive only. No existing data is deleted or overwritten.

create table if not exists public.payroll_settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  frequency text not null default 'alternate_friday',
  payroll_day text not null default 'friday',
  anchor_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint payroll_settings_frequency_check check (frequency in ('alternate_friday', 'weekly_friday', 'monthly')),
  constraint payroll_settings_day_check check (payroll_day in ('monday', 'tuesday', 'wednesday', 'thursday', 'friday'))
);

create unique index if not exists payroll_settings_company_unique
  on public.payroll_settings (company_id);

create index if not exists payroll_settings_company_updated_idx
  on public.payroll_settings (company_id, updated_at desc);

alter table public.payroll_settings enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'payroll_settings'
      and policyname = 'payroll_settings_select_admin'
  ) then
    create policy payroll_settings_select_admin
      on public.payroll_settings for select
      using (
        exists (
          select 1
          from public.company_members cm
          where cm.company_id = payroll_settings.company_id
            and cm.user_id = auth.uid()
            and lower(coalesce(cm.role, '')) in ('owner', 'supervisor')
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'payroll_settings'
      and policyname = 'payroll_settings_write_admin'
  ) then
    create policy payroll_settings_write_admin
      on public.payroll_settings for insert
      with check (
        exists (
          select 1
          from public.company_members cm
          where cm.company_id = payroll_settings.company_id
            and cm.user_id = auth.uid()
            and lower(coalesce(cm.role, '')) in ('owner', 'supervisor')
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'payroll_settings'
      and policyname = 'payroll_settings_update_admin'
  ) then
    create policy payroll_settings_update_admin
      on public.payroll_settings for update
      using (
        exists (
          select 1
          from public.company_members cm
          where cm.company_id = payroll_settings.company_id
            and cm.user_id = auth.uid()
            and lower(coalesce(cm.role, '')) in ('owner', 'supervisor')
        )
      )
      with check (
        exists (
          select 1
          from public.company_members cm
          where cm.company_id = payroll_settings.company_id
            and cm.user_id = auth.uid()
            and lower(coalesce(cm.role, '')) in ('owner', 'supervisor')
        )
      );
  end if;
end $$;

create table if not exists public.payroll_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  employee_id uuid not null,
  period_start date not null,
  period_end date not null,
  paid_amount numeric not null default 0 check (paid_amount >= 0),
  paid_date date not null,
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint payroll_payments_period_check check (period_start <= period_end)
);

create index if not exists payroll_payments_company_employee_period_idx
  on public.payroll_payments (company_id, employee_id, period_end desc, paid_date desc);

create index if not exists payroll_payments_company_deleted_idx
  on public.payroll_payments (company_id, deleted_at, period_end desc);

alter table public.payroll_payments enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'payroll_payments'
      and policyname = 'payroll_payments_select_admin'
  ) then
    create policy payroll_payments_select_admin
      on public.payroll_payments for select
      using (
        exists (
          select 1
          from public.company_members cm
          where cm.company_id = payroll_payments.company_id
            and cm.user_id = auth.uid()
            and lower(coalesce(cm.role, '')) in ('owner', 'supervisor')
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'payroll_payments'
      and policyname = 'payroll_payments_write_admin'
  ) then
    create policy payroll_payments_write_admin
      on public.payroll_payments for insert
      with check (
        exists (
          select 1
          from public.company_members cm
          where cm.company_id = payroll_payments.company_id
            and cm.user_id = auth.uid()
            and lower(coalesce(cm.role, '')) in ('owner', 'supervisor')
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'payroll_payments'
      and policyname = 'payroll_payments_update_admin'
  ) then
    create policy payroll_payments_update_admin
      on public.payroll_payments for update
      using (
        exists (
          select 1
          from public.company_members cm
          where cm.company_id = payroll_payments.company_id
            and cm.user_id = auth.uid()
            and lower(coalesce(cm.role, '')) in ('owner', 'supervisor')
        )
      )
      with check (
        exists (
          select 1
          from public.company_members cm
          where cm.company_id = payroll_payments.company_id
            and cm.user_id = auth.uid()
            and lower(coalesce(cm.role, '')) in ('owner', 'supervisor')
        )
      );
  end if;
end $$;

-- ============================================================
-- Source: 20260701123000_payroll_balance_forward_and_loans.sql
-- ============================================================
-- OPERA.AI payroll ledgers: balance brought forward and employee loan transactions.
-- Additive only. No existing data is deleted or overwritten.

create table if not exists public.payroll_balance_adjustments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  employee_id uuid not null,
  adjustment_type text not null,
  amount numeric not null,
  effective_date date not null,
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint payroll_balance_adjustments_type_check
    check (adjustment_type in ('brought_forward', 'manual_adjustment'))
);

create index if not exists payroll_balance_adjustments_company_employee_effective_idx
  on public.payroll_balance_adjustments (company_id, employee_id, effective_date desc, created_at desc);

create unique index if not exists payroll_balance_adjustments_company_employee_brought_forward_unique
  on public.payroll_balance_adjustments (company_id, employee_id)
  where deleted_at is null and adjustment_type = 'brought_forward';

alter table public.payroll_balance_adjustments enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'payroll_balance_adjustments'
      and policyname = 'payroll_balance_adjustments_select_admin'
  ) then
    create policy payroll_balance_adjustments_select_admin
      on public.payroll_balance_adjustments for select
      using (
        exists (
          select 1
          from public.company_members cm
          where cm.company_id = payroll_balance_adjustments.company_id
            and cm.user_id = auth.uid()
            and lower(coalesce(cm.role, '')) in ('owner', 'supervisor')
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'payroll_balance_adjustments'
      and policyname = 'payroll_balance_adjustments_write_admin'
  ) then
    create policy payroll_balance_adjustments_write_admin
      on public.payroll_balance_adjustments for insert
      with check (
        exists (
          select 1
          from public.company_members cm
          where cm.company_id = payroll_balance_adjustments.company_id
            and cm.user_id = auth.uid()
            and lower(coalesce(cm.role, '')) in ('owner', 'supervisor')
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'payroll_balance_adjustments'
      and policyname = 'payroll_balance_adjustments_update_admin'
  ) then
    create policy payroll_balance_adjustments_update_admin
      on public.payroll_balance_adjustments for update
      using (
        exists (
          select 1
          from public.company_members cm
          where cm.company_id = payroll_balance_adjustments.company_id
            and cm.user_id = auth.uid()
            and lower(coalesce(cm.role, '')) in ('owner', 'supervisor')
        )
      )
      with check (
        exists (
          select 1
          from public.company_members cm
          where cm.company_id = payroll_balance_adjustments.company_id
            and cm.user_id = auth.uid()
            and lower(coalesce(cm.role, '')) in ('owner', 'supervisor')
        )
      );
  end if;
end $$;

create table if not exists public.employee_loan_transactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  employee_id uuid not null,
  transaction_type text not null,
  amount numeric not null check (amount >= 0),
  transaction_date date not null,
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  constraint employee_loan_transactions_type_check
    check (transaction_type in ('loan_given', 'loan_returned'))
);

create index if not exists employee_loan_transactions_company_employee_date_idx
  on public.employee_loan_transactions (company_id, employee_id, transaction_date desc, created_at desc);

create index if not exists employee_loan_transactions_company_deleted_idx
  on public.employee_loan_transactions (company_id, deleted_at, transaction_date desc);

alter table public.employee_loan_transactions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'employee_loan_transactions'
      and policyname = 'employee_loan_transactions_select_admin'
  ) then
    create policy employee_loan_transactions_select_admin
      on public.employee_loan_transactions for select
      using (
        exists (
          select 1
          from public.company_members cm
          where cm.company_id = employee_loan_transactions.company_id
            and cm.user_id = auth.uid()
            and lower(coalesce(cm.role, '')) in ('owner', 'supervisor')
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'employee_loan_transactions'
      and policyname = 'employee_loan_transactions_write_admin'
  ) then
    create policy employee_loan_transactions_write_admin
      on public.employee_loan_transactions for insert
      with check (
        exists (
          select 1
          from public.company_members cm
          where cm.company_id = employee_loan_transactions.company_id
            and cm.user_id = auth.uid()
            and lower(coalesce(cm.role, '')) in ('owner', 'supervisor')
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'employee_loan_transactions'
      and policyname = 'employee_loan_transactions_update_admin'
  ) then
    create policy employee_loan_transactions_update_admin
      on public.employee_loan_transactions for update
      using (
        exists (
          select 1
          from public.company_members cm
          where cm.company_id = employee_loan_transactions.company_id
            and cm.user_id = auth.uid()
            and lower(coalesce(cm.role, '')) in ('owner', 'supervisor')
        )
      )
      with check (
        exists (
          select 1
          from public.company_members cm
          where cm.company_id = employee_loan_transactions.company_id
            and cm.user_id = auth.uid()
            and lower(coalesce(cm.role, '')) in ('owner', 'supervisor')
        )
      );
  end if;
end $$;

-- ============================================================
-- Source: 20260702120000_create_employee_vacation_periods.sql
-- ============================================================
-- B.2 additive vacation periods for timesheet and payroll visibility.
-- No existing data is deleted or modified destructively.

create table if not exists public.employee_vacation_periods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  employee_id uuid not null,
  start_date date not null,
  end_date date not null,
  reason text not null default '',
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_vacation_periods_range_check check (end_date >= start_date),
  constraint employee_vacation_periods_reason_check check (char_length(reason) between 1 and 500)
);

create index if not exists employee_vacation_periods_company_employee_start_idx
  on public.employee_vacation_periods (company_id, employee_id, start_date desc, end_date desc);

create index if not exists employee_vacation_periods_company_range_idx
  on public.employee_vacation_periods (company_id, start_date, end_date);

alter table public.employee_vacation_periods enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'employee_vacation_periods'
      and policyname = 'employee_vacation_periods_select_company_member'
  ) then
    create policy employee_vacation_periods_select_company_member
      on public.employee_vacation_periods
      for select
      to public
      using (
        exists (
          select 1
          from public.company_members cm
          where cm.company_id = employee_vacation_periods.company_id
            and cm.user_id = auth.uid()
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
      and tablename = 'employee_vacation_periods'
      and policyname = 'employee_vacation_periods_insert_owner_self'
  ) then
    create policy employee_vacation_periods_insert_owner_self
      on public.employee_vacation_periods
      for insert
      to public
      with check (
        exists (
          select 1
          from public.company_members cm
          where cm.company_id = employee_vacation_periods.company_id
            and cm.user_id = auth.uid()
        )
        and (
          employee_vacation_periods.employee_id = auth.uid()
          or exists (
            select 1
            from public.company_members cm
            where cm.company_id = employee_vacation_periods.company_id
              and cm.user_id = auth.uid()
              and lower(coalesce(cm.role, '')) in ('owner', 'supervisor')
          )
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
      and tablename = 'employee_vacation_periods'
      and policyname = 'employee_vacation_periods_update_owner_self'
  ) then
    create policy employee_vacation_periods_update_owner_self
      on public.employee_vacation_periods
      for update
      to public
      using (
        exists (
          select 1
          from public.company_members cm
          where cm.company_id = employee_vacation_periods.company_id
            and cm.user_id = auth.uid()
        )
        and (
          employee_vacation_periods.employee_id = auth.uid()
          or exists (
            select 1
            from public.company_members cm
            where cm.company_id = employee_vacation_periods.company_id
              and cm.user_id = auth.uid()
              and lower(coalesce(cm.role, '')) in ('owner', 'supervisor')
          )
        )
      )
      with check (
        exists (
          select 1
          from public.company_members cm
          where cm.company_id = employee_vacation_periods.company_id
            and cm.user_id = auth.uid()
        )
        and (
          employee_vacation_periods.employee_id = auth.uid()
          or exists (
            select 1
            from public.company_members cm
            where cm.company_id = employee_vacation_periods.company_id
              and cm.user_id = auth.uid()
              and lower(coalesce(cm.role, '')) in ('owner', 'supervisor')
          )
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
      and tablename = 'employee_vacation_periods'
      and policyname = 'employee_vacation_periods_delete_owner_self'
  ) then
    create policy employee_vacation_periods_delete_owner_self
      on public.employee_vacation_periods
      for delete
      to public
      using (
        exists (
          select 1
          from public.company_members cm
          where cm.company_id = employee_vacation_periods.company_id
            and cm.user_id = auth.uid()
        )
        and (
          employee_vacation_periods.employee_id = auth.uid()
          or exists (
            select 1
            from public.company_members cm
            where cm.company_id = employee_vacation_periods.company_id
              and cm.user_id = auth.uid()
              and lower(coalesce(cm.role, '')) in ('owner', 'supervisor')
          )
        )
      );
  end if;
end $$;

-- ============================================================
-- Source: 20260703120000_add_employee_auto_payroll_fields.sql
-- ============================================================
-- OPERA.AI additive payroll automation fields for company member settings.
-- These columns are company-specific and do not overwrite existing data.

alter table public.company_members
  add column if not exists auto_payroll_enabled boolean not null default false,
  add column if not exists auto_payroll_start_date date,
  add column if not exists auto_payroll_amount numeric(12, 2) not null default 0;

create index if not exists company_members_auto_payroll_company_enabled_idx
  on public.company_members (company_id, auto_payroll_enabled, auto_payroll_start_date);

-- ============================================================
-- Source: 20260703133000_add_payroll_settings_pay_date_offset.sql
-- ============================================================
-- Additive payroll settings update: allow pay dates to default to days after the period end.
-- Existing rows receive the default offset and no existing data is overwritten.

alter table public.payroll_settings
  add column if not exists pay_date_offset_days integer not null default 10;

-- ============================================================
-- POSTFLIGHT: schema verification and row-count sanity
-- ============================================================
do $$
declare
  row_count bigint;
begin
  raise notice 'OPERA.AI production postflight verification';

  select count(*) into row_count from pg_tables where schemaname = 'public' and tablename in (
    'chat_message_attachments',
    'chat_message_checklist_items',
    'chat_pins',
    'chat_lists',
    'chat_list_items',
    'employee_vacation_periods',
    'employee_pay_rates',
    'payroll_settings',
    'payroll_payments',
    'payroll_balance_adjustments',
    'employee_loan_transactions'
  );
  raise notice 'new tables verified present: %', row_count;

  if to_regclass('public.timesheets') is not null then
    execute 'select count(*) from public.timesheets where break_minutes >= 0' into row_count;
    raise notice 'timesheets break-ready rows checked: %', row_count;
  end if;

  if to_regclass('public.project_media') is not null then
    execute 'select count(*) from public.project_media where ai_extracted_json is not null or ai_review_status is not null' into row_count;
    raise notice 'project_media ai field rows checked: %', row_count;
  end if;

end $$;

-- Rollback notes:
-- - Prefer forward-fix migrations if any issue is found.
-- - Do not use destructive rollback SQL against production without Controller approval and backup/export review.
-- - Review row counts before and after any manual production execution.
