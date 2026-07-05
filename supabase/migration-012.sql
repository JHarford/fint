-- LifeFlow migration 012: Web Push subscriptions.
-- Each row is one device/browser the user enabled notifications on. The app
-- inserts a row when the user enables notifications; the droplet reads all
-- rows and sends pushes with the web-push library (see DROPLET.md).

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text not null default '',
  created_at timestamptz not null default now()
);

alter table push_subscriptions enable row level security;
create policy lifeflow_all_access on push_subscriptions
  for all using (true) with check (true);
