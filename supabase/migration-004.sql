-- Fint migration 004: recurring items get a subcategory so budgets can target
-- specific subcategories like "Eating Out", enabling per-subcategory actual-vs-budget.

alter table recurring_items add column if not exists subcategory text not null default '';

-- Seed sensible subcategory mappings on existing budget items
update recurring_items set subcategory = 'Eating Out'    where name = 'Eating Out & Coffee';
update recurring_items set subcategory = 'Groceries'     where name = 'Food & Groceries';
update recurring_items set subcategory = 'Personal Care' where name = 'Health & Personal';
update recurring_items set subcategory = 'Leisure'       where name = 'Leisure & Entertainment';
update recurring_items set subcategory = 'Shopping'      where name = 'Shopping (general)';
