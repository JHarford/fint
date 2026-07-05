-- LifeFlow migration 013: multi-day calendar entries (holidays, trips).
-- end_date null = single-day entry; set = the entry spans date..end_date
-- inclusive and shows on every day in the range.

alter table calendar_entries add column if not exists end_date date;
