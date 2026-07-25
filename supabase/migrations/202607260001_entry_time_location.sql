alter table public.cashlog_entries
  add column if not exists local_date date,
  add column if not exists time_zone text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists location_accuracy_m double precision;

alter table public.cashlog_entries
  drop constraint if exists cashlog_entries_latitude_check,
  drop constraint if exists cashlog_entries_longitude_check,
  drop constraint if exists cashlog_entries_location_accuracy_check;

alter table public.cashlog_entries
  add constraint cashlog_entries_latitude_check
    check (latitude is null or latitude between -90 and 90),
  add constraint cashlog_entries_longitude_check
    check (longitude is null or longitude between -180 and 180),
  add constraint cashlog_entries_location_accuracy_check
    check (location_accuracy_m is null or location_accuracy_m >= 0);
