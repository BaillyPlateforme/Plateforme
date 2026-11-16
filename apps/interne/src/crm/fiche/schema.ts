/*
 * La fiche du dossier façon Créagidem (src/crm/fiche), dans le schéma `crm`.
 * Appliquée au démarrage avec le reste du schéma (lib/schema.ts), en une
 * requête idempotente : on peut la rejouer autant qu'on veut.
 *
 * - contacts : plusieurs contacts par client (section Commun, onglet
 *   Contacts). Le contact principal reste le client lui-même (crm.clients) ;
 *   ces lignes sont les autres personnes à joindre : conjoint, assistante,
 *   gardien, service des achats d'un compte…
 * - services : les services complémentaires d'un dossier (section Services).
 *   MODÈLE PROVISOIRE, posé le 08/11/2026 en attendant que Bailly décrive ses
 *   services : un libellé, une date, un montant, un statut. Il ne porte ni
 *   devis ni facture ; il se complétera ou se remplacera sans rien casser
 *   ailleurs (aucune autre table ne le lit).
 * - clients.telephone2 : un second numéro (fixe, bureau…), comme les deux
 *   téléphones de la fiche Créagidem. Le premier reste celui des SMS.
 * - plusieurs téléphones (retours de Céline, 16/11/2026) : chaque numéro dit
 *   de quel numéro il s'agit (travail, M., Mme…). Le premier reste
 *   clients.telephone (celui des SMS), le deuxième clients.telephone2 : tout
 *   ce qui les lit déjà continue de les lire. Leurs libellés sont à côté ;
 *   les numéros suivants, dans telephones_autres ([{ numero, libelle }]).
 *   Voir src/crm/clients/telephones.ts.
 * - dossiers.distance_km : les kilomètres du trajet, d'une adresse à la
 *   suivante, par la route (src/crm/creation/distance.ts). Calculés à la
 *   création et à chaque enregistrement des adresses.
 */
export const SCHEMA_FICHE = `
create table if not exists crm.contacts (
  id serial primary key,
  client_id int not null references crm.clients(id) on delete cascade,
  civilite text, prenom text, nom text not null, fonction text, telephone text, email text, notes text,
  cree_le timestamptz not null default now()
);
create index if not exists idx_contacts_client on crm.contacts(client_id);
create table if not exists crm.services (
  id serial primary key,
  dossier_id int not null references crm.dossiers(id) on delete cascade,
  libelle text not null, date_prevue date, montant numeric(10,2),
  statut text not null default 'prevu' check (statut in ('prevu','confirme','realise','annule')),
  notes text, cree_le timestamptz not null default now()
);
create index if not exists idx_services_dossier on crm.services(dossier_id);
alter table crm.clients add column if not exists telephone2 text;
-- Retours de Céline (16/11/2026) : plusieurs téléphones, chacun avec ce qu'il désigne ; les kilomètres du trajet.
alter table crm.clients add column if not exists telephone_libelle text;
alter table crm.clients add column if not exists telephone2_libelle text;
alter table crm.clients add column if not exists telephones_autres jsonb not null default '[]'::jsonb check (jsonb_typeof(telephones_autres) = 'array');
alter table crm.dossiers add column if not exists distance_km int check (distance_km is null or distance_km between 0 and 40000);
alter table crm.contacts enable row level security;
alter table crm.services enable row level security;
`;
