/*
 * Le schéma du CRM, appliqué au démarrage en une requête idempotente (même
 * principe que Power 21) : on peut la rejouer autant qu'on veut.
 *
 * Chaque objet est écrit avec son schéma, `crm.` : même si le réglage de la
 * connexion manquait, rien ne serait créé dans `public`, où vivent les tables
 * de l'espace équipe. Les index et les séquences suivent leur table.
 *
 * La sécurité au niveau des lignes est activée sur chaque table, comme pour
 * celles de l'espace équipe : le schéma `crm` n'est pas exposé par l'API de
 * Supabase, et si quelqu'un l'exposait un jour, aucune ligne ne sortirait sans
 * règle écrite exprès. Le serveur du CRM, propriétaire des tables, n'est pas
 * concerné.
 */
export const SCHEMA = `
create schema if not exists crm;
create table if not exists crm.utilisateurs (
  id serial primary key, nom text not null, initiales text not null,
  role text not null check (role in ('direction','commercial','exploitation','compta')),
  email text unique
);
create table if not exists crm.clients (
  id serial primary key,
  type text not null default 'particulier' check (type in ('particulier','compte','militaire','partenaire')),
  civilite text, prenom text, nom text not null, societe text, email text, telephone text, notes text,
  cree_le timestamptz not null default now()
);
create table if not exists crm.dossiers (
  id serial primary key, ref text unique not null,
  client_id int not null references crm.clients(id) on delete cascade,
  commercial_id int references crm.utilisateurs(id), traite_par_id int references crm.utilisateurs(id),
  statut text not null default 'prospect' check (statut in ('prospect','visite','devis','commande','planifie','termine','perdu')),
  periode text, mois_ca date, date_chargement date, date_livraison date,
  volume numeric(7,2) not null default 0, observations text,
  cree_le timestamptz not null default now(), maj_le timestamptz not null default now()
);
create table if not exists crm.etapes_trajet (
  id serial primary key, dossier_id int not null references crm.dossiers(id) on delete cascade,
  ordre int not null default 0,
  genre text not null default 'depart' check (genre in ('depart','garde_meuble','arrivee','autre')),
  adresse text, etage text, ascenseur boolean not null default false, acces text
);
create table if not exists crm.rendez_vous (
  id serial primary key, dossier_id int references crm.dossiers(id) on delete set null,
  commercial_id int not null references crm.utilisateurs(id),
  type text not null check (type in ('phys','visio','tache','perso')),
  titre text not null, lieu text, debut timestamptz not null, duree_min int not null default 60,
  notes text, devis_etabli boolean not null default false, termine boolean not null default false
);
create table if not exists crm.inventaire (
  id serial primary key, dossier_id int not null references crm.dossiers(id) on delete cascade,
  piece text not null, libelle text not null, quantite int not null default 1,
  volume numeric(6,2) not null default 0, destination text not null default 'Arrivée',
  demontage boolean not null default false
);
create table if not exists crm.devis (
  id serial primary key, dossier_id int not null references crm.dossiers(id) on delete cascade,
  numero text unique not null,
  formule text not null check (formule in ('premium','standard','economique')),
  lignes jsonb not null default '[]', montant numeric(10,2) not null default 0,
  statut text not null default 'brouillon' check (statut in ('brouillon','envoye','signe','refuse')),
  envoye_le timestamptz, signe_le timestamptz, cree_le timestamptz not null default now()
);
create table if not exists crm.lettres_voiture (
  id serial primary key, dossier_id int not null references crm.dossiers(id) on delete cascade,
  numero text unique not null, trajet text not null,
  date_chargement date, date_livraison date, prestataire text not null default 'Bailly Paris',
  prix_sous_traitance numeric(10,2), montant numeric(10,2) not null default 0,
  statut text not null default 'a_planifier' check (statut in ('a_planifier','planifiee','en_cours','livree'))
);
create table if not exists crm.factures (
  id serial primary key, dossier_id int not null references crm.dossiers(id) on delete cascade,
  numero text unique not null, objet text not null, montant numeric(10,2) not null,
  statut text not null default 'emise' check (statut in ('emise','payee','retard')),
  emise_le date not null default current_date, payee_le date
);
create table if not exists crm.paiements (
  id serial primary key, dossier_id int not null references crm.dossiers(id) on delete cascade,
  libelle text not null, montant numeric(10,2) not null, recu_le date not null default current_date
);
create table if not exists crm.activite (
  id serial primary key, dossier_id int references crm.dossiers(id) on delete cascade,
  utilisateur_id int references crm.utilisateurs(id), libelle text not null,
  cree_le timestamptz not null default now()
);
-- L'utilisateur du CRM est retrouvé par l'e-mail de son compte Supabase (déjà présent en V1).
alter table crm.utilisateurs add column if not exists email text unique;
alter table crm.dossiers add column if not exists passer_en_dernier boolean not null default false;
alter table crm.dossiers add column if not exists vehicule boolean not null default false;
alter table crm.lettres_voiture add column if not exists equipe text;
alter table crm.lettres_voiture add column if not exists immatriculation text;
alter table crm.lettres_voiture add column if not exists instructions text;
create index if not exists idx_dossiers_client on crm.dossiers(client_id);
create index if not exists idx_dossiers_statut on crm.dossiers(statut);
create index if not exists idx_rdv_debut on crm.rendez_vous(debut);
create index if not exists idx_devis_dossier on crm.devis(dossier_id);
create index if not exists idx_activite_cree on crm.activite(cree_le desc);
alter table crm.utilisateurs enable row level security;
alter table crm.clients enable row level security;
alter table crm.dossiers enable row level security;
alter table crm.etapes_trajet enable row level security;
alter table crm.rendez_vous enable row level security;
alter table crm.inventaire enable row level security;
alter table crm.devis enable row level security;
alter table crm.lettres_voiture enable row level security;
alter table crm.factures enable row level security;
alter table crm.paiements enable row level security;
alter table crm.activite enable row level security;
`;
