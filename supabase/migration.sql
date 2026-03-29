-- Fint: Personal Finance Dashboard - Database Migration

-- Sources (financial accounts/cards)
create table if not exists sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('credit_card', 'bank_account', 'loan')),
  created_at timestamptz default now()
);

-- Transactions (from CSV uploads)
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references sources(id) on delete cascade,
  number text not null,
  date date not null,
  account text not null default '',
  amount numeric(12,2) not null,
  subcategory text not null default '',
  memo text not null default '',
  created_at timestamptz default now(),
  unique (source_id, number)
);

create index if not exists idx_transactions_source_date on transactions(source_id, date);
create index if not exists idx_transactions_date on transactions(date);

-- Recurring items (direct debits, subscriptions, income, budgets)
create table if not exists recurring_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  amount numeric(12,2) not null,
  next_date date not null,
  frequency text not null check (frequency in ('weekly', 'monthly', 'quarterly', 'annually')),
  category text not null default '',
  is_spread boolean not null default false,
  is_active boolean not null default true,
  source_id uuid references sources(id) on delete set null,
  target_source_id uuid references sources(id) on delete set null,
  end_date date,
  annual_increase numeric(5,2) not null default 0,
  created_at timestamptz default now()
);

-- Account balances (point-in-time snapshots)
create table if not exists account_balances (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references sources(id) on delete cascade,
  balance numeric(12,2) not null,
  as_of_date date not null,
  created_at timestamptz default now()
);

create index if not exists idx_account_balances_source on account_balances(source_id, as_of_date desc);

-- Debts (loans, mortgage, tax) — linked to recurring payments
create table if not exists debts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  current_balance numeric(12,2) not null,
  recurring_item_id uuid references recurring_items(id) on delete set null,
  type text not null check (type in ('loan', 'mortgage', 'tax', 'other')),
  interest_rate numeric(5,2) not null default 0,
  include_in_net_worth boolean not null default true,
  created_at timestamptz default now()
);

-- Assets (property, vehicles, investments)
create table if not exists assets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  current_value numeric(12,2) not null,
  type text not null check (type in ('property', 'vehicle', 'investment', 'other')),
  annual_change numeric(5,2) not null default 0,
  include_in_net_worth boolean not null default true,
  created_at timestamptz default now()
);
