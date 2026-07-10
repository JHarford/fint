-- LifeFlow migration 017: weigh-ins.
-- One weight per day; logging a weigh-in also becomes the live bodyweight
-- behind the BMR and the g/kg protein target.

create table if not exists weight_logs (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  weight_kg numeric not null,
  created_at timestamptz not null default now()
);

alter table weight_logs enable row level security;
create policy lifeflow_all_access on weight_logs for all using (true) with check (true);
