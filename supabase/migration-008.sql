-- LifeFlow migration 008: sobriety extras + calendar times

-- Abstinence goals can optionally track what the habit used to cost, so the
-- app can show money saved and units avoided as the streak grows.
alter table goals add column if not exists weekly_spend numeric(10,2);
alter table goals add column if not exists weekly_units numeric(10,2);

-- Calendar entries get an optional time of day ("14:30"); empty = all-day.
alter table calendar_entries add column if not exists event_time text not null default '';
