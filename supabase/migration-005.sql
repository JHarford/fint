-- Fint migration 005: rearchitect recurring concepts into three places
-- 1. Recurrence tag lives ON each transaction (auto-detected or manual)
-- 2. future_obligations holds items with no actuals yet (school fees, planned income)
-- 3. category_budgets holds spending targets per category/subcategory

-- 1) Transactions get a recurrence tag
alter table transactions
  add column if not exists recurrence text
    check (recurrence is null or recurrence in ('weekly','monthly','quarterly','annually','one-off'));
alter table transactions
  add column if not exists recurrence_group text not null default '';
alter table transactions
  add column if not exists recurrence_confidence text not null default ''
    check (recurrence_confidence in ('','detected','llm','manual'));

create index if not exists idx_transactions_recurrence_group on transactions(recurrence_group);

-- 2) Future obligations: forecast-only items with no transactions yet
create table if not exists future_obligations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  amount numeric(12,2) not null,
  next_date date not null,
  frequency text not null check (frequency in ('weekly','monthly','quarterly','annually','one-off')),
  category text not null default '',
  subcategory text not null default '',
  is_active boolean not null default true,
  source_id uuid references sources(id) on delete set null,
  target_source_id uuid references sources(id) on delete set null,
  end_date date,
  annual_increase numeric(5,2) not null default 0,
  notes text not null default '',
  created_at timestamptz default now()
);
alter table future_obligations disable row level security;

-- 3) Category budgets: monthly spending targets
create table if not exists category_budgets (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  subcategory text not null default '',
  monthly_amount numeric(12,2) not null,
  notes text not null default '',
  created_at timestamptz default now(),
  unique (category, subcategory)
);
alter table category_budgets disable row level security;

-- Seed category_budgets from existing is_spread recurring items
insert into category_budgets (category, subcategory, monthly_amount)
select
  category,
  coalesce(nullif(subcategory, ''), '') as subcategory,
  case frequency
    when 'weekly'    then amount * 52.0 / 12.0
    when 'quarterly' then amount / 3.0
    when 'annually'  then amount / 12.0
    else amount
  end as monthly_amount
from recurring_items
where is_spread = true and is_active = true
on conflict (category, subcategory) do nothing;

-- Seed future_obligations from recurring items with NO linked transactions
-- (these are pure-forecast items: school fees, planned income, Airmergent etc.)
insert into future_obligations
  (name, amount, next_date, frequency, category, subcategory,
   is_active, source_id, target_source_id, end_date, annual_increase)
select
  r.name, r.amount, r.next_date, r.frequency, r.category,
  coalesce(nullif(r.subcategory, ''), ''),
  r.is_active, r.source_id, r.target_source_id, r.end_date, r.annual_increase
from recurring_items r
where r.is_spread = false
  and not exists (select 1 from transactions t where t.recurring_item_id = r.id);
