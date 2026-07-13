-- ============================================================
-- 0003 — Modules CRM : devis, clients, emails, équipe, réglages
-- ============================================================

-- Fiches clients (enrichissement, clé = email) -----------------------------
create table if not exists client_profiles (
  email       text primary key,
  nom         text,
  telephone   text,
  societe     text,
  notes       text,
  tags        text[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger client_profiles_set_updated_at
  before update on client_profiles for each row execute function set_updated_at();

-- Devis ---------------------------------------------------------------------
create type devis_status as enum ('brouillon', 'envoye', 'accepte', 'refuse', 'expire');

create table if not exists devis (
  id           uuid primary key default gen_random_uuid(),
  reference    text unique not null,
  request_id   uuid references requests(id) on delete set null,
  client_nom   text,
  client_email text,
  montant_ht   numeric(10,2) not null default 0,
  montant_tva  numeric(10,2) not null default 0,
  montant_ttc  numeric(10,2) not null default 0,
  grid_id      uuid references pricing_grids(id) on delete set null,
  lignes       jsonb not null default '[]'::jsonb,
  status       devis_status not null default 'brouillon',
  valid_until  date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists devis_created_idx on devis (created_at desc);
create index if not exists devis_client_idx on devis (client_email);
create trigger devis_set_updated_at
  before update on devis for each row execute function set_updated_at();

-- Emails (journal + envoi) --------------------------------------------------
create type email_status as enum ('envoye', 'echec', 'brouillon');

create table if not exists emails (
  id           uuid primary key default gen_random_uuid(),
  destinataire text not null,
  client_email text,
  sujet        text not null,
  corps        text not null,
  template     text,
  status       email_status not null default 'envoye',
  erreur       text,
  created_at   timestamptz not null default now()
);
create index if not exists emails_created_idx on emails (created_at desc);

-- Équipe --------------------------------------------------------------------
create table if not exists team_members (
  id          uuid primary key,          -- = auth.users.id si compte créé
  email       text unique not null,
  nom         text,
  role        text not null default 'agent',   -- 'admin' | 'agent'
  actif       boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Réglages (ligne unique) ---------------------------------------------------
create table if not exists settings (
  id                   boolean primary key default true,
  entreprise_nom       text not null default 'Bailly Déménagement',
  entreprise_email     text,
  entreprise_tel       text,
  entreprise_adresse   text,
  siret                text,
  signature_email      text,
  n8n_webhook_url      text,
  devis_validite_jours int not null default 30,
  updated_at           timestamptz not null default now(),
  constraint settings_singleton check (id)
);
create trigger settings_set_updated_at
  before update on settings for each row execute function set_updated_at();
insert into settings (id) values (true) on conflict do nothing;

-- RLS (accès back-end via service_role uniquement)
alter table client_profiles enable row level security;
alter table devis           enable row level security;
alter table emails          enable row level security;
alter table team_members    enable row level security;
alter table settings        enable row level security;
