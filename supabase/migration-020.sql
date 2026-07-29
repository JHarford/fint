-- LifeFlow migration 020: auth scaffolding (Phase 1 of 2 for multi-tenancy)
--
-- Additive and SAFE: it adds a nullable user_id to every app table (defaulting
-- to auth.uid() for future inserts) and an invite-only allowlist enforced at
-- signup. Existing rows get user_id = NULL and stay fully visible under the
-- current permissive policies, so the running app is unaffected by this file.
--
-- Migration 021 then backfills those NULLs to YOUR account and swaps RLS to
-- per-user. Do 020 first, then follow the runbook (enable magic-link auth,
-- add yourself to allowed_emails, deploy, sign in once) BEFORE running 021.

-- 1. Invite allowlist -------------------------------------------------------
-- Only emails in this table can create an account. Manage it from the
-- Supabase SQL editor (service role), e.g.
--   insert into allowed_emails (email) values ('joe@harford.dev');
create table if not exists allowed_emails (
  email    text primary key,
  added_at timestamptz not null default now()
);
alter table allowed_emails enable row level security;
-- No policy on purpose: the anon key that ships in the app cannot read or
-- write this table. It is managed only via the SQL editor / service role.

create or replace function public.enforce_email_allowlist()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from allowed_emails where lower(email) = lower(new.email)
  ) then
    raise exception 'This email is not on the LifeFlow invite list.';
  end if;
  return new;
end $$;

drop trigger if exists enforce_allowlist on auth.users;
create trigger enforce_allowlist
  before insert on auth.users
  for each row execute function public.enforce_email_allowlist();

-- 2. Add a nullable, self-owning user_id to every app table -----------------
-- default auth.uid() means future inserts from the signed-in app are tagged
-- automatically; existing rows resolve to NULL here (no JWT at migration time)
-- and are backfilled in 021.
do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'sources','transactions','recurring_items','account_balances',
      'debts','assets','future_obligations','category_budgets',
      'category_rules','savings_buckets','goals','goal_entries',
      'calendar_entries','coach_messages','journal_days','push_subscriptions',
      'chores','chore_logs','food_logs','calpal_settings','weight_logs'
    ])
  loop
    execute format(
      'alter table public.%I add column if not exists user_id uuid '
      'default auth.uid() references auth.users(id) on delete cascade', t);
    execute format(
      'create index if not exists %I on public.%I (user_id)',
      t || '_user_id_idx', t);
  end loop;
end $$;
