-- B.2 Phase 1: pay-rate history + structured receipt OCR fields.
-- Safe additive migration for manual Supabase review. Do not run automatically.

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
