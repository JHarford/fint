-- LifeFlow migration 018: count-per-day habits ("5 pints of water a day").
-- daily_target null = classic once-a-day habit; set = the entry value counts
-- up through the day (0..N) and the day is 'done' when it reaches the target.

alter table goals add column if not exists daily_target int;
