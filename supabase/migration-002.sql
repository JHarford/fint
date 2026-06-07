-- Fint migration 002: transaction categories + rule cache + savings buckets

-- 1) Add `category` to transactions (top-level fixed taxonomy)
alter table transactions add column if not exists category text not null default '';
create index if not exists idx_transactions_category on transactions(category);

-- 2) Category rules: cache LLM + manual decisions, keyed by a normalised memo pattern
create table if not exists category_rules (
  id uuid primary key default gen_random_uuid(),
  pattern text not null,
  category text not null,
  subcategory text not null default '',
  match_count int not null default 1,
  source text not null default 'llm' check (source in ('llm', 'manual')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (pattern)
);

create index if not exists idx_category_rules_pattern on category_rules(pattern);

-- 3) Savings buckets (sinking funds): user-defined goals with monthly allocations
create table if not exists savings_buckets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  target_amount numeric(12,2),
  target_date date,
  monthly_allocation numeric(12,2) not null default 0,
  current_amount numeric(12,2) not null default 0,
  source_id uuid references sources(id) on delete set null,
  icon text not null default 'piggy-bank',
  color text not null default 'blue',
  is_active boolean not null default true,
  created_at timestamptz default now()
);

create index if not exists idx_savings_buckets_active on savings_buckets(is_active);
