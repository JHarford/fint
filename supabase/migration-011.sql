-- LifeFlow migration 011: personal-best goals (speedcubing, darts, 5k time…)
-- A 'record' goal logs attempts; the PB is the min (lower is better, e.g.
-- times) or max (higher is better, e.g. scores) of all logged values.

alter table goals drop constraint if exists goals_goal_type_check;
alter table goals add constraint goals_goal_type_check
  check (goal_type in ('abstinence', 'habit', 'target', 'record'));

alter table goals add column if not exists record_direction text not null default 'lower'
  check (record_direction in ('lower', 'higher'));
