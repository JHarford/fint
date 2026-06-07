-- Fint migration 003: link transactions to recurring items

alter table transactions
  add column if not exists recurring_item_id uuid references recurring_items(id) on delete set null;

create index if not exists idx_transactions_recurring on transactions(recurring_item_id);
