create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key,
  email text not null,
  role text not null default 'customer',
  full_name text,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.profiles
  add column if not exists email text,
  add column if not exists role text not null default 'customer',
  add column if not exists full_name text,
  add column if not exists created_at timestamptz not null default timezone('utc', now());

create unique index if not exists profiles_email_lower_unique_idx
  on public.profiles (lower(email));

create or replace function public.orpl_is_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and lower(coalesce(role, '')) in ('manager', 'admin', 'owner')
  );
$$;

grant execute on function public.orpl_is_manager() to authenticated;

create or replace function public.orpl_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  customer_name text not null,
  email text not null,
  phone text,
  project_name text,
  project_address text,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.customers
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

create unique index if not exists customers_user_id_unique_idx
  on public.customers (user_id);

create index if not exists customers_created_at_idx
  on public.customers (created_at desc);

create or replace function public.orpl_customer_id_for_user(target_user_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.id
  from public.customers c
  where c.user_id = target_user_id
  order by c.created_at asc
  limit 1
$$;

create or replace function public.orpl_owns_customer(target_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.customers c
    where c.id = target_customer_id
      and c.user_id = auth.uid()
  );
$$;

grant execute on function public.orpl_customer_id_for_user(uuid) to authenticated;
grant execute on function public.orpl_owns_customer(uuid) to authenticated;

create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  sort_order integer not null default 0,
  allow_multiple_selection boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists product_categories_name_lower_unique_idx
  on public.product_categories (lower(name));

create index if not exists product_categories_sort_idx
  on public.product_categories (sort_order asc, created_at asc);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.product_categories(id) on delete cascade,
  name text not null,
  description text,
  price_type text not null default 'included' check (price_type in ('included', 'upgrade')),
  upgrade_price numeric(10, 2) not null default 0 check (upgrade_price >= 0),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists products_category_sort_idx
  on public.products (category_id, sort_order asc, created_at asc);

create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  image_url text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists product_images_product_sort_idx
  on public.product_images (product_id, sort_order asc, created_at asc);

create table if not exists public.customer_selections (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  category_id uuid not null references public.product_categories(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists customer_selections_customer_category_product_unique_idx
  on public.customer_selections (customer_id, category_id, product_id);

create index if not exists customer_selections_customer_idx
  on public.customer_selections (customer_id, updated_at desc);

create or replace function public.orpl_validate_customer_selection()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  matched_category_id uuid;
  multi_allowed boolean;
begin
  select p.category_id
  into matched_category_id
  from public.products p
  where p.id = new.product_id;

  if matched_category_id is null then
    raise exception 'Selected product does not exist.';
  end if;

  new.category_id = matched_category_id;

  select c.allow_multiple_selection
  into multi_allowed
  from public.product_categories c
  where c.id = new.category_id;

  if coalesce(multi_allowed, false) = false then
    delete from public.customer_selections existing
    where existing.customer_id = new.customer_id
      and existing.category_id = new.category_id
      and existing.id <> coalesce(new.id, gen_random_uuid());
  end if;

  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'orpl_customers_touch_updated_at'
  ) then
    create trigger orpl_customers_touch_updated_at
      before update on public.customers
      for each row
      execute function public.orpl_touch_updated_at();
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'orpl_product_categories_touch_updated_at'
  ) then
    create trigger orpl_product_categories_touch_updated_at
      before update on public.product_categories
      for each row
      execute function public.orpl_touch_updated_at();
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'orpl_products_touch_updated_at'
  ) then
    create trigger orpl_products_touch_updated_at
      before update on public.products
      for each row
      execute function public.orpl_touch_updated_at();
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'orpl_customer_selections_validate'
  ) then
    create trigger orpl_customer_selections_validate
      before insert or update on public.customer_selections
      for each row
      execute function public.orpl_validate_customer_selection();
  end if;
end $$;

alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.product_categories enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.customer_selections enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles' and policyname = 'orpl_profiles_select_own_or_manager'
  ) then
    create policy orpl_profiles_select_own_or_manager
      on public.profiles
      for select
      to authenticated
      using (id = auth.uid() or public.orpl_is_manager());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles' and policyname = 'orpl_profiles_update_own_or_manager'
  ) then
    create policy orpl_profiles_update_own_or_manager
      on public.profiles
      for update
      to authenticated
      using (id = auth.uid() or public.orpl_is_manager())
      with check (id = auth.uid() or public.orpl_is_manager());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'customers' and policyname = 'orpl_customers_manager_full_access'
  ) then
    create policy orpl_customers_manager_full_access
      on public.customers
      for all
      to authenticated
      using (public.orpl_is_manager())
      with check (public.orpl_is_manager());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'customers' and policyname = 'orpl_customers_customer_select_own'
  ) then
    create policy orpl_customers_customer_select_own
      on public.customers
      for select
      to authenticated
      using (user_id = auth.uid());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'product_categories' and policyname = 'orpl_categories_manager_full_access'
  ) then
    create policy orpl_categories_manager_full_access
      on public.product_categories
      for all
      to authenticated
      using (public.orpl_is_manager())
      with check (public.orpl_is_manager());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'product_categories' and policyname = 'orpl_categories_customer_read_active'
  ) then
    create policy orpl_categories_customer_read_active
      on public.product_categories
      for select
      to authenticated
      using (is_active = true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'products' and policyname = 'orpl_products_manager_full_access'
  ) then
    create policy orpl_products_manager_full_access
      on public.products
      for all
      to authenticated
      using (public.orpl_is_manager())
      with check (public.orpl_is_manager());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'products' and policyname = 'orpl_products_customer_read_active'
  ) then
    create policy orpl_products_customer_read_active
      on public.products
      for select
      to authenticated
      using (
        is_active = true
        and exists (
          select 1
          from public.product_categories c
          where c.id = products.category_id
            and c.is_active = true
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'product_images' and policyname = 'orpl_product_images_manager_full_access'
  ) then
    create policy orpl_product_images_manager_full_access
      on public.product_images
      for all
      to authenticated
      using (public.orpl_is_manager())
      with check (public.orpl_is_manager());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'product_images' and policyname = 'orpl_product_images_customer_read_active'
  ) then
    create policy orpl_product_images_customer_read_active
      on public.product_images
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.products p
          join public.product_categories c on c.id = p.category_id
          where p.id = product_images.product_id
            and p.is_active = true
            and c.is_active = true
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'customer_selections' and policyname = 'orpl_customer_selections_manager_full_access'
  ) then
    create policy orpl_customer_selections_manager_full_access
      on public.customer_selections
      for all
      to authenticated
      using (public.orpl_is_manager())
      with check (public.orpl_is_manager());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'customer_selections' and policyname = 'orpl_customer_selections_customer_read_own'
  ) then
    create policy orpl_customer_selections_customer_read_own
      on public.customer_selections
      for select
      to authenticated
      using (public.orpl_owns_customer(customer_id));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'customer_selections' and policyname = 'orpl_customer_selections_customer_write_own'
  ) then
    create policy orpl_customer_selections_customer_write_own
      on public.customer_selections
      for insert
      to authenticated
      with check (
        public.orpl_owns_customer(customer_id)
        and exists (
          select 1
          from public.product_categories c
          where c.id = customer_selections.category_id
            and c.is_active = true
        )
        and exists (
          select 1
          from public.products p
          join public.product_categories c on c.id = p.category_id
          where p.id = customer_selections.product_id
            and p.category_id = customer_selections.category_id
            and p.is_active = true
            and c.is_active = true
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'customer_selections' and policyname = 'orpl_customer_selections_customer_update_own'
  ) then
    create policy orpl_customer_selections_customer_update_own
      on public.customer_selections
      for update
      to authenticated
      using (public.orpl_owns_customer(customer_id))
      with check (
        public.orpl_owns_customer(customer_id)
        and exists (
          select 1
          from public.product_categories c
          where c.id = customer_selections.category_id
            and c.is_active = true
        )
        and exists (
          select 1
          from public.products p
          join public.product_categories c on c.id = p.category_id
          where p.id = customer_selections.product_id
            and p.category_id = customer_selections.category_id
            and p.is_active = true
            and c.is_active = true
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'customer_selections' and policyname = 'orpl_customer_selections_customer_delete_own'
  ) then
    create policy orpl_customer_selections_customer_delete_own
      on public.customer_selections
      for delete
      to authenticated
      using (public.orpl_owns_customer(customer_id));
  end if;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'orpl-product-images',
  'orpl-product-images',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'orpl_storage_manager_insert'
  ) then
    create policy orpl_storage_manager_insert
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'orpl-product-images'
        and public.orpl_is_manager()
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'orpl_storage_manager_update'
  ) then
    create policy orpl_storage_manager_update
      on storage.objects
      for update
      to authenticated
      using (
        bucket_id = 'orpl-product-images'
        and public.orpl_is_manager()
      )
      with check (
        bucket_id = 'orpl-product-images'
        and public.orpl_is_manager()
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'orpl_storage_manager_delete'
  ) then
    create policy orpl_storage_manager_delete
      on storage.objects
      for delete
      to authenticated
      using (
        bucket_id = 'orpl-product-images'
        and public.orpl_is_manager()
      );
  end if;
end $$;
