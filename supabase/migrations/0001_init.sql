-- ============================================================
-- Bailly Déménagement — schéma initial
-- Source de vérité unique : formulaire + mail convergent ici.
-- ============================================================

-- Types énumérés -------------------------------------------------------------

create type request_source as enum ('form', 'email');

create type request_status as enum (
  'new',          -- vient d'arriver, pas encore analysée
  'analyzing',    -- scoring / analyse volume en cours
  'qualified',    -- analysée, prête pour devis
  'quoted',       -- devis envoyé
  'won',
  'lost',
  'archived'
);

create type volume_method as enum ('explicit', 'list', 'ai');

-- Table principale : une demande --------------------------------------------

create table requests (
  id             uuid primary key default gen_random_uuid(),
  source         request_source not null,
  status         request_status not null default 'new',

  -- Client
  client_nom     text,
  client_email   text,
  client_tel     text,

  -- Départ
  depart_adresse   text,
  depart_code_postal text,
  depart_ville     text,
  depart_etage     int,
  depart_ascenseur boolean,

  -- Arrivée
  arrivee_adresse   text,
  arrivee_code_postal text,
  arrivee_ville     text,
  arrivee_etage     int,
  arrivee_ascenseur boolean,

  -- Planning
  date_souhaitee date,
  flexibilite    text,

  -- Volume (agrégé, quelle que soit la méthode)
  volume_m3      numeric(8,2),
  volume_method  volume_method,

  -- Scoring IA / métier
  score_potentiel  int check (score_potentiel between 0 and 100),
  score_difficulte int check (score_difficulte between 0 and 100),
  score_notes      text,

  -- On ne perd jamais rien : payload brut du form ou du mail parsé
  raw_payload    jsonb not null default '{}'::jsonb,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index requests_status_idx      on requests (status);
create index requests_created_at_idx  on requests (created_at desc);
create index requests_score_pot_idx   on requests (score_potentiel desc);

-- Photos (étape Volume par IA) ----------------------------------------------

create table request_photos (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references requests(id) on delete cascade,
  storage_path text not null,              -- chemin dans le bucket Supabase Storage
  piece        text,                       -- pièce détectée / saisie
  ai_analysis  jsonb,                       -- { piece, objets: [{label, qte, volume_m3}], volume_m3 }
  volume_m3    numeric(8,2),
  created_at   timestamptz not null default now()
);

create index request_photos_request_idx on request_photos (request_id);

-- Items (étape Volume par liste) --------------------------------------------

create table request_items (
  id                uuid primary key default gen_random_uuid(),
  request_id        uuid not null references requests(id) on delete cascade,
  label             text not null,
  quantite          int not null default 1,
  volume_unitaire_m3 numeric(8,2) not null default 0,
  created_at        timestamptz not null default now()
);

create index request_items_request_idx on request_items (request_id);

-- Timeline / audit ----------------------------------------------------------

create table request_events (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references requests(id) on delete cascade,
  type        text not null,               -- 'created', 'scored', 'status_changed', 'note', ...
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index request_events_request_idx on request_events (request_id, created_at desc);

-- updated_at auto ------------------------------------------------------------

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger requests_set_updated_at
  before update on requests
  for each row execute function set_updated_at();

-- ============================================================
-- RLS : le service_role (API serveur) bypass tout.
-- On verrouille l'accès public ; seul le back-end Next.js écrit,
-- via la service key. L'auth équipe se fait au niveau applicatif.
-- ============================================================

alter table requests        enable row level security;
alter table request_photos  enable row level security;
alter table request_items   enable row level security;
alter table request_events  enable row level security;

-- Aucune policy "public" : par défaut, tout est refusé pour anon/authenticated.
-- Le back-end utilise la SUPABASE_SERVICE_ROLE_KEY qui contourne la RLS.
-- (On ajoutera des policies fines quand l'auth équipe Supabase sera branchée.)
