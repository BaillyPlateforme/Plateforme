/*
 * Le schéma de la section Relances (08/11/2026), ajouté à celui du CRM
 * (crm/lib/schema.ts) et rejoué à chaque démarrage : idempotent.
 *
 *   - crm.relances_regles reçoit le reste de la règle : le repère du premier
 *     délai, les canaux, les jours et heures d'envoi (sans valeur imposée :
 *     null = sans restriction), les segments de client exclus ;
 *   - crm.relances garde les canaux par où une relance est partie, et ce
 *     qu'elle a demandé (elements : les éléments retenus à l'envoi, sur
 *     combien — l'équipe peut n'en cocher que certains) ;
 *   - crm.relances_exclusions : les dossiers à ne pas relancer, pour un type
 *     ou pour tous (type « * ») ;
 *   - crm.relances_journal : le journal des modifications de règles et
 *     d'exclusions.
 */
export const SCHEMA_RELANCES = `
alter table crm.relances_regles add column if not exists repere text;
alter table crm.relances_regles add column if not exists canaux text[] not null default '{email}';
alter table crm.relances_regles add column if not exists jours_envoi int[];
alter table crm.relances_regles add column if not exists heure_debut int;
alter table crm.relances_regles add column if not exists heure_fin int;
alter table crm.relances_regles add column if not exists segments_exclus text[] not null default '{}';
alter table crm.relances add column if not exists canaux text[];
alter table crm.relances add column if not exists elements jsonb;
create index if not exists idx_relances_statut on crm.relances(statut, envoyee_le desc);
create table if not exists crm.relances_exclusions (
  dossier_id int not null references crm.dossiers(id) on delete cascade,
  type text not null default '*',
  motif text, par text, cree_le timestamptz not null default now(),
  primary key (dossier_id, type)
);
create table if not exists crm.relances_journal (
  id serial primary key, type text, action text not null,
  avant jsonb, apres jsonb, resume text not null, par text,
  cree_le timestamptz not null default now()
);
create index if not exists idx_relances_journal_cree on crm.relances_journal(cree_le desc);
alter table crm.relances_exclusions enable row level security;
alter table crm.relances_journal enable row level security;
`;
