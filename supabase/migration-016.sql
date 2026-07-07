-- LifeFlow migration 016: Cal Pal macros.
-- Per-item protein and fat (grams), and a protein target expressed as
-- g per kg of bodyweight (the standard way muscle-gain targets are set;
-- ~1.6-2.2 g/kg when building, 0.8 g/kg maintenance).

alter table food_logs add column if not exists protein numeric not null default 0;
alter table food_logs add column if not exists fat numeric not null default 0;

alter table calpal_settings add column if not exists protein_per_kg numeric not null default 1.6;
