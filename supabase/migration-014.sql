-- LifeFlow migration 014: house jobs (chores).
-- Deliberately NOT goals: no streaks, no coaching, no guilt. A chore is a
-- reusable tag ("ironing", "dishwasher", "bathroom clean") and a chore_log
-- marks it done on a day. The useful signal is recency — how long since the
-- bathroom was last cleaned — shown as a badge on each chip.

create table if not exists chores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists chore_logs (
  id uuid primary key default gen_random_uuid(),
  chore_id uuid not null references chores(id) on delete cascade,
  date date not null,
  created_at timestamptz not null default now(),
  unique (chore_id, date)
);

create index if not exists idx_chore_logs_chore_date on chore_logs(chore_id, date desc);

alter table chores enable row level security;
create policy lifeflow_all_access on chores for all using (true) with check (true);
alter table chore_logs enable row level security;
create policy lifeflow_all_access on chore_logs for all using (true) with check (true);
