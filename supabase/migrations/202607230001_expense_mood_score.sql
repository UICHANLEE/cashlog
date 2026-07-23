-- Optional 1-5 satisfaction score for an expense or income moment.
alter table public.cashlog_entries
  add column if not exists mood_score smallint
  check (mood_score between 1 and 5);
