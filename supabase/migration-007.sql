-- LifeFlow migration 007: calendar + coaching
-- Both tables are designed to accept rows pushed from outside the app (e.g. a
-- droplet that reads your email and inserts events, or generates coaching) via
-- the Supabase REST API — see DROPLET.md. The `source` column records who wrote
-- the row: 'user' (in the app), 'droplet' (pushed externally), 'ai' (generated).

create table if not exists calendar_entries (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  date date not null,
  entry_type text not null default 'event' check (entry_type in ('event', 'birthday', 'reminder', 'task')),
  notes text not null default '',
  recurs_annually boolean not null default false,   -- birthdays/anniversaries repeat every year
  is_done boolean not null default false,           -- for reminders/tasks
  source text not null default 'user' check (source in ('user', 'droplet', 'ai')),
  created_at timestamptz default now()
);
create index if not exists idx_calendar_entries_date on calendar_entries(date);
alter table calendar_entries disable row level security;

create table if not exists coach_messages (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  context text not null default '',                 -- what prompted it (e.g. "2 missed days on No alcohol")
  goal_id uuid references goals(id) on delete cascade,
  source text not null default 'ai' check (source in ('rule', 'ai', 'droplet')),
  is_read boolean not null default false,
  created_at timestamptz default now()
);
create index if not exists idx_coach_messages_unread on coach_messages(is_read, created_at desc);
alter table coach_messages disable row level security;
