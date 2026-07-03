-- LifeFlow migration 009: consistent row-level security posture
--
-- Symptom this fixes: "new row violates row-level security policy for table X".
-- Supabase's Security Advisor offers one-click "Enable RLS" on tables; with RLS
-- enabled and no policies, all writes are rejected. This migration enables RLS
-- on every app table and adds an explicit allow-all policy, which behaves the
-- same as the original RLS-disabled setup but works whether or not RLS was
-- toggled on, and stops the advisor warnings.
--
-- NOTE: allow-all means anyone holding the anon key (which ships in the built
-- app) can read/write. That's the same exposure as before — acceptable for a
-- private single-user deployment. Locking this down properly means adding
-- Supabase Auth and replacing these policies with auth-based ones.

do $$
declare
  t text;
begin
  for t in
    select tablename from pg_tables
    where schemaname = 'public'
      and tablename in (
        'sources', 'transactions', 'recurring_items', 'account_balances',
        'debts', 'assets', 'future_obligations', 'category_budgets',
        'category_rules', 'savings_buckets',
        'goals', 'goal_entries', 'calendar_entries', 'coach_messages'
      )
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists lifeflow_all_access on public.%I', t);
    execute format(
      'create policy lifeflow_all_access on public.%I for all using (true) with check (true)', t
    );
  end loop;
end $$;
