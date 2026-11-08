/*
 * Le journal des gestes (demande de David, 08/11/2026 : « on doit voir tout
 * ce qui est fait »), dans le schéma crm, rejoué à chaque démarrage :
 * idempotent. Voir packages/commun/src/lib/journal.ts (l'écriture) et
 * src/crm/feed (la lecture, page /feed).
 *
 * Une ligne par geste qui ne laissait aucune trace ailleurs : les
 * suppressions d'abord (une ligne supprimée ne se voit plus nulle part), et
 * les gestes faits hors d'un dossier (modèles, règles, partenaires,
 * conteneurs, équipe…). Les gestes déjà inscrits au fil d'un dossier
 * (crm.activite) ou à l'historique d'une demande (public.request_events) n'y
 * sont pas recopiés.
 *
 * - quand : l'heure du serveur ;
 * - acteur_type : staff (un membre de l'équipe), client, ou auto (une tâche,
 *   une règle) ; acteur_id = crm.utilisateurs quand on le connaît, acteur_nom
 *   et acteur_email recopiés pour que la ligne survive à son auteur ;
 * - action : un code stable (« devis.supprime », « modele.supprime »…) ;
 *   objet_type, objet_id : ce sur quoi porte le geste (texte : un numéro du
 *   CRM ou un uuid de l'espace équipe) ;
 * - dossier_id, request_id : le dossier du CRM, la demande du site, sans clé
 *   étrangère — le journal garde la trace d'un dossier supprimé ;
 * - libelle : la phrase, telle qu'elle s'affiche ; details : ce qui a été
 *   supprimé ou changé (numéro, montant, nom…), jamais un texte de message ;
 * - activite_id : la ligne du fil du dossier (crm.activite) écrite pour le
 *   même geste, quand il y en a une — le Feed n'en montre alors qu'une.
 */
export const SCHEMA_JOURNAL = `
create table if not exists crm.journal (
  id bigserial primary key,
  quand timestamptz not null default now(),
  acteur_type text not null check (acteur_type in ('staff','client','auto')),
  acteur_id int, acteur_nom text, acteur_email text,
  action text not null, objet_type text, objet_id text,
  dossier_id int, request_id uuid,
  libelle text not null, details jsonb not null default '{}',
  activite_id int
);
create index if not exists idx_journal_quand on crm.journal(quand desc, id desc);
create index if not exists idx_journal_dossier on crm.journal(dossier_id, quand desc) where dossier_id is not null;
create index if not exists idx_journal_request on crm.journal(request_id, quand desc) where request_id is not null;
create index if not exists idx_journal_acteur on crm.journal(acteur_id, quand desc) where acteur_id is not null;
create index if not exists idx_journal_activite on crm.journal(activite_id) where activite_id is not null;
alter table crm.journal enable row level security;
`;
