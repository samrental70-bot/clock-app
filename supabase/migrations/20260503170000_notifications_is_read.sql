alter table public.notifications add column if not exists is_read boolean not null default false;

update public.notifications set is_read = true where read_at is not null;
