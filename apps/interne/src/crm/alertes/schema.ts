/*
 * Les alertes de l'équipe (08/11/2026), dans le schéma crm, rejoué à chaque
 * démarrage : idempotent. Voir packages/commun/src/lib/alertes-equipe.
 *
 *   - crm.alertes_destinataires : les adresses ajoutées à la main, et la mise
 *     en pause de n'importe quelle adresse (l'équipe elle-même se lit dans
 *     public.team_members, sans y écrire) ; « @conseiller » = le conseiller
 *     du dossier ;
 *   - crm.alertes_abonnements : ce que l'équipe a réglé, adresse par alerte
 *     (sans ligne : l'abonnement d'office du catalogue) ;
 *   - crm.alertes_reglages : l'activation de chaque alerte et son texte ;
 *   - crm.alertes_evenements : le journal des alertes déclenchées.
 */
export const SCHEMA_ALERTES = `
create table if not exists crm.alertes_destinataires (
  email text primary key, nom text, manuel boolean not null default false, en_pause boolean not null default false,
  par text, cree_le timestamptz not null default now(), maj_le timestamptz not null default now()
);
create table if not exists crm.alertes_abonnements (
  email text not null, alerte text not null, abonne boolean not null, par text, maj_le timestamptz not null default now(),
  primary key (email, alerte)
);
create table if not exists crm.alertes_reglages (
  cle text primary key, actif boolean not null default true, objet text, corps text, valide boolean not null default false,
  maj_par text, maj_le timestamptz not null default now()
);
create table if not exists crm.alertes_evenements (
  id serial primary key, alerte text not null, evenement text not null, reference text, destinataires int not null default 0,
  resume text, cree_le timestamptz not null default now()
);
create index if not exists idx_alertes_evenements_cree on crm.alertes_evenements(cree_le desc);
alter table crm.alertes_destinataires enable row level security;
alter table crm.alertes_abonnements enable row level security;
alter table crm.alertes_reglages enable row level security;
alter table crm.alertes_evenements enable row level security;
`;
