-- Fint migration 006: personal goal planner
-- Goals come in three flavours:
--   abstinence — "don't do X" goals (no alcohol, no smoking); success is a clean day, streaks matter
--   habit      — "do X regularly" goals (gym, running); success is N check-ins per week
--   target     — "reach X" goals (savings, weight); progress is a logged numeric value over time

create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  goal_type text not null check (goal_type in ('abstinence', 'habit', 'target')),
  icon text not null default 'target',
  color text not null default 'emerald',
  start_date date not null default current_date,
  -- habit goals: how many check-ins per week count as "on track" (7 = daily)
  frequency_per_week int,
  -- target goals: where you started, where you're heading, and by when
  start_value numeric(12,2) not null default 0,
  target_value numeric(12,2),
  unit text not null default '',
  target_date date,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz default now()
);
alter table goals disable row level security;

-- One entry per goal per day.
--   abstinence: value 1 = clean day, value 0 = slip (breaks the streak)
--   habit:      value 1 = done
--   target:     value = current measured amount (balance, weight, ...)
create table if not exists goal_entries (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references goals(id) on delete cascade,
  date date not null,
  value numeric(12,2) not null default 1,
  note text not null default '',
  created_at timestamptz default now(),
  unique (goal_id, date)
);
create index if not exists idx_goal_entries_goal_date on goal_entries(goal_id, date desc);
alter table goal_entries disable row level security;
