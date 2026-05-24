alter table public.companies
  alter column auto_clock_out_time set default '00:00';

update public.companies
set auto_clock_out_time = '00:00'
where auto_clock_out_time is null
   or btrim(auto_clock_out_time) = ''
   or auto_clock_out_time = '12:00';

comment on column public.companies.auto_clock_out_time is
  'Company local wall-clock time in HH:MM for automatic clock-out. Default is 00:00 midnight.';
