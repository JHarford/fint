-- LifeFlow migration 021: backfill ownership + lock RLS to per-user (Phase 2)
--
-- PREREQUISITES — do these first:
--   1. Migration 020 is applied.
--   2. Magic-link (Email) auth is enabled and you have signed in once, so your
--      auth user exists.
--   3. Set `owner` below to YOUR user id. Find it via:
--        select id, email from auth.users order by created_at;
--      (or Supabase dashboard > Authentication > Users).
--
-- ⚠️ Run this BEFORE adding any test users to allowed_emails. Until it
-- completes, other signed-in users would still see your data (permissive RLS).
--
-- WHY YOUR DATA IS SAFE: each table is backfilled to you, THEN `set not null`
-- runs. If any row was somehow missed, `set not null` raises and the entire
-- migration rolls back in one transaction — nothing is orphaned or deleted.
-- Run the whole file at once.

do $$
declare
  owner uuid := '00000000-0000-0000-0000-000000000000'; -- <<< REPLACE with your user id
  t text;
begin
  if not exists (select 1 from auth.users where id = owner) then
    raise exception 'owner % is not a real auth user — set your real id first', owner;
  end if;

  for t in
    select unnest(array[
      'sources','transactions','recurring_items','account_balances',
      'debts','assets','future_obligations','category_budgets',
      'category_rules','savings_buckets','goals','goal_entries',
      'calendar_entries','coach_messages','journal_days','push_subscriptions',
      'chores','chore_logs','food_logs','calpal_settings','weight_logs'
    ])
  loop
    -- Move every pre-auth row under your account
    execute format('update public.%I set user_id = %L where user_id is null', t, owner);
    -- Require ownership from now on (guards against any missed row)
    execute format('alter table public.%I alter column user_id set not null', t);
    -- Replace the allow-all policy with a strict per-user one
    execute format('drop policy if exists lifeflow_all_access on public.%I', t);
    execute format(
      'create policy user_owns_rows on public.%I for all '
      'using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;
