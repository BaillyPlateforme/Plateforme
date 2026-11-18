/*
 * Les dossiers CIMOB/DICOM (mail « BAILLY - militaire » de Céline,
 * 17/11/2026), dans le schéma `crm`. Appliqué au démarrage avec le reste du
 * schéma (lib/schema.ts), en une requête idempotente.
 *
 * - clients.situation_famille (un code de SITUATIONS_FAMILLE, cimob/commun.ts)
 *   et clients.matricule, cherché par la recherche des clients et celle de la
 *   barre du haut ;
 * - etapes_trajet.departement_om : le département (ou la collectivité)
 *   d'outre-mer d'une adresse, par son code officiel (971…988) ; il sert au
 *   filtre et au tri des clients CIMOB/DICOM par département ;
 * - crm.replis : le repli d'un dossier, une ligne au plus par dossier. Son
 *   adresse « de son choix » est ici, et non une étape du trajet : une
 *   quarantaine de lectures prennent toutes les étapes d'un dossier (le
 *   kilométrage, les destinations de la tablette, le planning, les lettres de
 *   voiture, le devis, l'enregistrement de la fenêtre Adresses…), et le repli
 *   n'est pas sur le trajet de l'import ou de l'export ;
 * - crm.vehicules : les véhicules transportés (crm.dossiers.vehicule reste le
 *   « Oui / Non »), avec, pour une moto ou une voiture, les dimensions retenues
 *   par l'estimation de l'IA (estimation, jsonb).
 *
 * La sécurité au niveau des lignes est activée sur les deux tables, comme sur
 * toutes celles du CRM (lib/schema.ts).
 */
export const SCHEMA_CIMOB = `
alter table crm.clients add column if not exists situation_famille text;
alter table crm.clients add column if not exists matricule text;
create index if not exists idx_clients_matricule on crm.clients (lower(matricule)) where matricule is not null;
alter table crm.etapes_trajet add column if not exists departement_om text;
create index if not exists idx_etapes_departement_om on crm.etapes_trajet (departement_om) where departement_om is not null;
create table if not exists crm.replis (
  dossier_id int primary key references crm.dossiers(id) on delete cascade,
  repli boolean not null default false,
  volume_droits numeric(7,2) check (volume_droits is null or volume_droits > 0),
  periode text,
  destination text check (destination in ('garde_meuble','adresse')),
  lieu text,
  adresse text, code_postal text, ville text, pays text, etage text,
  ascenseur boolean not null default false, ascenseur_taille text,
  departement_om text,
  maj_le timestamptz not null default now()
);
create table if not exists crm.vehicules (
  id serial primary key,
  dossier_id int not null references crm.dossiers(id) on delete cascade,
  ordre int not null default 0,
  genre text not null check (genre in ('moto','voiture','autre')),
  motorisation text check (motorisation in ('essence','diesel','hybride','electrique')),
  marque text, modele text, description text,
  volume numeric(6,2) check (volume is null or (volume > 0 and volume < 1000)),
  estimation jsonb,
  cree_le timestamptz not null default now()
);
create index if not exists idx_vehicules_dossier on crm.vehicules(dossier_id, ordre);
alter table crm.replis enable row level security;
alter table crm.vehicules enable row level security;
`;
