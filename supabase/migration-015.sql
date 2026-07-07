-- LifeFlow migration 015: Cal Pal food tracker.
-- food_logs: everything eaten, one row per item per day. Calories are learned:
-- typing a food you've logged before pre-fills its last calorie count.
-- calpal_settings: single row (id=1) with the numbers behind the daily target
-- (Mifflin-St Jeor BMR × activity + surplus/deficit adjustment).

create table if not exists food_logs (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  name text not null,
  calories int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_food_logs_date on food_logs(date desc);

create table if not exists calpal_settings (
  id int primary key default 1 check (id = 1),
  weight_kg numeric not null default 80,
  height_cm numeric not null default 178,
  sex text not null default 'male' check (sex in ('male', 'female')),
  age int not null default 35,
  activity numeric not null default 1.4,
  adjustment int not null default 0,
  updated_at timestamptz not null default now()
);

alter table food_logs enable row level security;
create policy lifeflow_all_access on food_logs for all using (true) with check (true);
alter table calpal_settings enable row level security;
create policy lifeflow_all_access on calpal_settings for all using (true) with check (true);
