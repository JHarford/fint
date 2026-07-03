-- LifeFlow migration 010: virtual savings buckets growth + daily journal

-- Buckets grow virtually from a start date: value = current_amount +
-- monthly_allocation × full months elapsed. No money moves anywhere.
alter table savings_buckets add column if not exists start_date date not null default current_date;

-- One journal row per day: a tweet-length note and a small square photo
-- (400x400 JPEG stored as a data URL — a few tens of KB per day).
create table if not exists journal_days (
  id uuid primary key default gen_random_uuid(),
  day date not null unique,
  note text not null default '',
  photo_data text not null default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table journal_days enable row level security;
drop policy if exists lifeflow_all_access on journal_days;
create policy lifeflow_all_access on journal_days for all using (true) with check (true);
