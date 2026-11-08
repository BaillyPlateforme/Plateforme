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
alter table crm.contacts enable row level security;
alter table crm.services enable row level security;
`;
