/*
 * Le devis complet, à la manière de Créagidem (audit du 08/11/2026, sections
 * H à K) : ajouts idempotents au schéma `crm`, rejoués à chaque démarrage
 * (voir lib/schema.ts, qui les ajoute en fin de requête).
 *
 * Les devis d'avant gardent leurs colonnes et leurs lignes : `lignes` reste
 * le tableau que lisent la fiche, le Kanban, le Parcours et la projection
 * vers l'espace client (libellé, `prix` TTC, `charge`). Les lignes du
 * nouveau chiffrage y ajoutent leurs champs (quantité, prix unitaire, TVA…)
 * et gardent `prix`, recalculé à chaque enregistrement.
 *
 * - `saisie` : 'ttc' pour les devis d'avant (prix saisis TTC), 'ht' pour les
 *   nouveaux (prix unitaires HT, comme Créagidem) ;
 * - `mode` : 'forfait' (un prix global imprimé) ou 'postes' (lignes
 *   détaillées) ; les devis d'avant sont détaillés ;
 * - `origine` : d'où vient le devis ('formules' pour le générateur des trois
 *   formules, 'libre', 'copie') ; le générateur ne remplace que les siens.
 * - Aucune valeur métier n'est inventée : taux, conditions et CGV sont vides
 *   tant que Bailly ne les a pas fournis (table crm.devis_parametres).
 */
export const SCHEMA_DEVIS = `
do $$ begin
  if exists (select 1 from pg_constraint where conrelid = 'crm.devis'::regclass and conname = 'devis_formule_check'
             and pg_get_constraintdef(oid) not like '%libre%') then
    alter table crm.devis drop constraint devis_formule_check;
    alter table crm.devis add constraint devis_formule_check check (formule in ('premium','standard','economique','libre'));
  end if;
end $$;
alter table crm.devis add column if not exists titre text;
alter table crm.devis add column if not exists origine text;
alter table crm.devis add column if not exists copie_de int;
alter table crm.devis add column if not exists saisie text not null default 'ttc';
alter table crm.devis add column if not exists mode text not null default 'postes';
alter table crm.devis add column if not exists remise_pct numeric(5,2) not null default 0;
alter table crm.devis add column if not exists montant_ht numeric(10,2);
alter table crm.devis add column if not exists montant_tva numeric(10,2);
alter table crm.devis add column if not exists commercial_id int references crm.utilisateurs(id) on delete set null;
alter table crm.devis add column if not exists date_devis date;
alter table crm.devis add column if not exists date_visite date;
alter table crm.devis add column if not exists poids_lourds text;
alter table crm.devis add column if not exists arrhes_pct numeric(5,2);
alter table crm.devis add column if not exists reglement_solde text;
alter table crm.devis add column if not exists commentaire_interne text;
alter table crm.devis add column if not exists ref_interne text;
alter table crm.devis add column if not exists categorie_specifique boolean not null default false;
alter table crm.devis add column if not exists categorie_libelle text;
alter table crm.devis add column if not exists assurance jsonb not null default '{}';
alter table crm.devis add column if not exists achats jsonb not null default '[]';
alter table crm.devis add column if not exists moyens jsonb not null default '{}';
alter table crm.devis add column if not exists international jsonb not null default '{}';
alter table crm.devis add column if not exists validation jsonb;
alter table crm.devis add column if not exists retire_le timestamptz;
alter table crm.devis add column if not exists maj_le timestamptz;
alter table crm.dossiers add column if not exists origine_demande text;
create table if not exists crm.devis_parametres (
  cle text primary key, valeur jsonb not null, maj_le timestamptz not null default now(), maj_par text
);
alter table crm.devis_parametres enable row level security;
`;
