-- ============================================================
-- 0002 — Grilles tarifaires + champs enrichis sur les demandes
-- ============================================================

-- Champs enrichis sur requests (formulaire complet + chiffrage) -------------
alter table requests
  add column if not exists type_logement_depart  text,
  add column if not exists type_logement_arrivee  text,
  add column if not exists distance_km            numeric(8,1),
  add column if not exists formule                text,          -- 'eco' | 'standard' | 'luxe'
  add column if not exists services               jsonb not null default '{}'::jsonb,
                                                                 -- { emballage, demontage, montage, monte_meuble, garde_meuble }
  add column if not exists estimation_prix        numeric(10,2), -- devis estimé via grille
  add column if not exists grid_id                uuid;          -- grille utilisée pour l'estimation

-- Grilles tarifaires ---------------------------------------------------------
create table if not exists pricing_grids (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  is_active     boolean not null default true,
  is_default    boolean not null default false,

  -- Composantes de prix
  base_price            numeric(10,2) not null default 0,   -- forfait de base
  price_per_m3          numeric(10,2) not null default 0,   -- €/m³
  price_per_km          numeric(10,2) not null default 0,   -- €/km
  floor_surcharge       numeric(10,2) not null default 0,   -- €/étage sans ascenseur
  long_carry_surcharge  numeric(10,2) not null default 0,   -- portage long
  packing_price_per_m3  numeric(10,2) not null default 0,   -- emballage €/m³
  furniture_lift_price  numeric(10,2) not null default 0,   -- monte-meuble (forfait)
  min_price             numeric(10,2) not null default 0,   -- prix plancher
  vat_rate              numeric(5,2)  not null default 20,   -- TVA %

  -- Paliers optionnels par volume : [{ min_m3, max_m3, price_per_m3 }]
  tiers         jsonb not null default '[]'::jsonb,
  notes         text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger pricing_grids_set_updated_at
  before update on pricing_grids
  for each row execute function set_updated_at();

-- Une seule grille par défaut : index partiel unique
create unique index if not exists pricing_grids_single_default
  on pricing_grids (is_default) where is_default;

alter table requests
  add constraint requests_grid_fk
  foreign key (grid_id) references pricing_grids(id) on delete set null;

alter table pricing_grids enable row level security;

-- Grille par défaut de démarrage --------------------------------------------
insert into pricing_grids
  (name, is_default, base_price, price_per_m3, price_per_km,
   floor_surcharge, packing_price_per_m3, furniture_lift_price, min_price, vat_rate)
values
  ('Grille standard', true, 250, 45, 1.2, 30, 25, 180, 350, 20)
on conflict do nothing;
