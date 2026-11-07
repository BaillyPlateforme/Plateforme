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
-- Modules ajoutés après le face-à-face avec Créagidem : type de déménagement,
-- devis détaillé (données contractuelles, prestations), signature par lien,
-- factures de garde-meuble (sans dossier, d'où dossier_id facultatif).
alter table crm.dossiers add column if not exists type_demenagement text not null default 'national';
alter table crm.factures alter column dossier_id drop not null;
alter table crm.factures add column if not exists garde_meuble_id int;
alter table crm.devis add column if not exists distance_km int;
alter table crm.devis add column if not exists deplacement text not null default 'route';
alter table crm.devis add column if not exists groupage boolean not null default false;
alter table crm.devis add column if not exists validite date;
alter table crm.devis add column if not exists conditions text;
alter table crm.devis add column if not exists token text;
alter table crm.devis add column if not exists prestations jsonb not null default '[]';
-- « Demandes Internet » retiré le 07/11/2026 : les demandes du site arrivent par
-- les Questionnaires (public.requests). La table ne contenait que des données fictives.
drop table if exists crm.demandes_web;
create table if not exists crm.litiges (
  id serial primary key, dossier_id int not null references crm.dossiers(id) on delete cascade, ouvert_le date not null default current_date,
  objet text not null, statut text not null default 'ouvert' check (statut in ('ouvert','en_cours','clos')), montant numeric(10,2)
);
create table if not exists crm.garde_meuble (
  id serial primary key, dossier_id int references crm.dossiers(id) on delete set null, client text not null, nb_caisses int not null default 1, numeros text,
  loyer_mensuel numeric(8,2) not null, periodicite text not null default 'mensuelle' check (periodicite in ('mensuelle','trimestrielle')),
  debut date not null, derniere_facture date, assurance boolean not null default true, actif boolean not null default true
);
create table if not exists crm.conteneurs (
  id serial primary key, numero text unique not null, sens text not null check (sens in ('export','import')), taille text not null default '40 pieds',
  capacite numeric(6,2) not null default 67, destination text not null, plomb text,
  statut text not null default 'preparation' check (statut in ('preparation','charge','en_mer','arrive','livre')), depart_prevu date, arrivee_prevue date, groupeur text
);
create table if not exists crm.conteneur_dossiers (
  id serial primary key, conteneur_id int not null references crm.conteneurs(id) on delete cascade, dossier_id int not null references crm.dossiers(id) on delete cascade,
  volume numeric(6,2) not null, ville_livraison text, unique (conteneur_id, dossier_id)
);
create table if not exists crm.modeles_messages (
  id serial primary key, canal text not null check (canal in ('sms','email')), nom text not null, objet text, corps text not null
);
create table if not exists crm.operations (
  id serial primary key, equipe text not null, jour date not null, genre text not null check (genre in ('chargement','livraison','groupage','manuelle')),
  titre text not null, detail text, dossier_id int references crm.dossiers(id) on delete set null
);
-- L'espace client relié au CRM (migration 0012) : le segment « logement
-- social » (cahier des charges, §2), la demande du site d'où vient un
-- dossier, et la session de paiement en ligne qui a produit un paiement (un
-- événement rejoué n'inscrit pas deux fois les mêmes arrhes).
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'crm.clients'::regclass and conname = 'clients_type_check'
                 and pg_get_constraintdef(oid) like '%logement_social%') then
    alter table crm.clients drop constraint if exists clients_type_check;
    alter table crm.clients add constraint clients_type_check check (type in ('particulier','compte','militaire','partenaire','logement_social'));
  end if;
end $$;
alter table crm.dossiers add column if not exists request_id uuid;
create unique index if not exists idx_dossiers_request on crm.dossiers(request_id);
alter table crm.paiements add column if not exists session_paiement_id uuid;
create unique index if not exists idx_paiements_session on crm.paiements(session_paiement_id);
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
alter table crm.litiges enable row level security;
alter table crm.garde_meuble enable row level security;
alter table crm.conteneurs enable row level security;
alter table crm.conteneur_dossiers enable row level security;
alter table crm.modeles_messages enable row level security;
alter table crm.operations enable row level security;
-- L'outil terrain des déménageurs (cahier des charges, §4) : un compte par
-- déménageur (compte Supabase Auth, app_metadata.role = 'terrain'), et les
-- photos de chantier, rangées dans le seau privé « photos-chantier ».
-- Voir src/terrain/lib/agents.ts et photos.ts.
create table if not exists crm.agents_terrain (
  id serial primary key, auth_id uuid unique not null, identifiant text unique not null, email text unique not null,
  prenom text not null, nom text, equipe text, interimaire boolean not null default false,
  actif boolean not null default true, mdp_provisoire boolean not null default true, demo boolean not null default false,
  cree_par text, cree_le timestamptz not null default now(), desactive_le timestamptz
);
create table if not exists crm.photos_chantier (
  id serial primary key, cle uuid unique not null,
  dossier_id int not null references crm.dossiers(id) on delete cascade,
  agent_id int references crm.agents_terrain(id) on delete set null, utilisateur_id int references crm.utilisateurs(id) on delete set null,
  auteur text not null, equipe text, categorie text not null check (categorie in ('avant','apres','detail')), note text,
  prise_le timestamptz not null default now(), prise_appareil timestamptz,
  latitude double precision, longitude double precision, precision_m real,
  chemin text not null, chemin_vignette text, type text not null, taille int not null, largeur int, hauteur int,
  demo boolean not null default false
);
create index if not exists idx_photos_chantier_dossier on crm.photos_chantier(dossier_id, prise_le desc);
create index if not exists idx_photos_chantier_agent on crm.photos_chantier(agent_id, prise_le desc);
alter table crm.agents_terrain enable row level security;
alter table crm.photos_chantier enable row level security;
-- Dispatch des conteneurs internationaux (§5 du cahier des charges), voir
-- src/crm/dispatch : un plan par groupage, ses imports, ses clients (lignes),
-- les colonnes du Kanban (conteneurs, tournées, dates, zones), les
-- propositions de regroupement et l'historique. La place d'un client est sa
-- colonne et son rang dans la colonne ; sans colonne, il est « à répartir ».
create table if not exists crm.dispatch_plans (
  id serial primary key, nom text not null, sens text not null default 'export' check (sens in ('export','import')),
  port text, date_reference date, notes text,
  capacite_20 numeric(6,2) not null default 33, capacite_40 numeric(6,2) not null default 67,
  demo boolean not null default false, cree_par int references crm.utilisateurs(id) on delete set null,
  cree_le timestamptz not null default now(), maj_le timestamptz not null default now()
);
create table if not exists crm.dispatch_colonnes (
  id serial primary key, plan_id int not null references crm.dispatch_plans(id) on delete cascade,
  genre text not null default 'conteneur' check (genre in ('conteneur','tournee','date','zone')),
  libelle text not null, taille text check (taille in ('20','40')), capacite numeric(7,2), zone text, jour date,
  conteneur_id int references crm.conteneurs(id) on delete set null, ordre double precision not null default 0,
  verrouillee_le timestamptz, verrouillee_par int references crm.utilisateurs(id) on delete set null,
  cree_le timestamptz not null default now()
);
create table if not exists crm.dispatch_imports (
  id serial primary key, plan_id int not null references crm.dispatch_plans(id) on delete cascade,
  source text not null check (source in ('csv','excel','manuel','demo')), fichier text, nb_lignes int not null default 0,
  correspondance jsonb, importe_par int references crm.utilisateurs(id) on delete set null, importe_le timestamptz not null default now()
);
create table if not exists crm.dispatch_lignes (
  id serial primary key, plan_id int not null references crm.dispatch_plans(id) on delete cascade,
  import_id int references crm.dispatch_imports(id) on delete set null,
  colonne_id int references crm.dispatch_colonnes(id) on delete set null, rang double precision not null default 0,
  client text not null, ville text, pays text, volume numeric(7,2) not null default 0, remarques text, telephone text,
  dossier_id int references crm.dossiers(id) on delete set null, cree_le timestamptz not null default now()
);
create table if not exists crm.dispatch_propositions (
  id serial primary key, plan_id int not null references crm.dispatch_plans(id) on delete cascade,
  methode text not null check (methode in ('ia','regles')), modele text, repli text, duree_ms int,
  parametres jsonb not null default '{}', contenu jsonb not null,
  statut text not null default 'proposee' check (statut in ('proposee','appliquee','ecartee')),
  demandee_par int references crm.utilisateurs(id) on delete set null, cree_le timestamptz not null default now(), traitee_le timestamptz
);
create table if not exists crm.dispatch_historique (
  id serial primary key, plan_id int not null references crm.dispatch_plans(id) on delete cascade,
  ligne_id int references crm.dispatch_lignes(id) on delete set null, colonne_id int references crm.dispatch_colonnes(id) on delete set null,
  action text not null, libelle text not null, details jsonb,
  utilisateur_id int references crm.utilisateurs(id) on delete set null, cree_le timestamptz not null default now()
);
create index if not exists idx_dispatch_colonnes_plan on crm.dispatch_colonnes(plan_id, ordre);
create index if not exists idx_dispatch_lignes_plan on crm.dispatch_lignes(plan_id, colonne_id, rang);
create index if not exists idx_dispatch_historique_plan on crm.dispatch_historique(plan_id, cree_le desc);
alter table crm.dispatch_plans enable row level security;
alter table crm.dispatch_colonnes enable row level security;
alter table crm.dispatch_imports enable row level security;
alter table crm.dispatch_lignes enable row level security;
alter table crm.dispatch_propositions enable row level security;
alter table crm.dispatch_historique enable row level security;
`;
