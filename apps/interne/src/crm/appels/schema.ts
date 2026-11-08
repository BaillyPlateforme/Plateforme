/*
 * Les appels à passer (src/crm/appels), ajoutés au schéma du CRM
 * (crm/lib/schema.ts) et rejoués à chaque démarrage : idempotent.
 *
 * Les appels se CALCULENT à partir de leurs sources (rappels demandés,
 * nouvelles demandes, devis sans réponse, visites de demain) : seules les
 * décisions de l'équipe sont gardées, une ligne par appel —
 *
 *   source, objet_id    d'où vient l'appel et sur quoi il porte : le rappel
 *                       (uuid de public.request_events), la demande (uuid de
 *                       public.requests), le dossier ou le rendez-vous du CRM ;
 *   occurrence          ce qui l'a rendu dû (la date d'envoi du devis, l'heure
 *                       de la visite ; vide sinon) : un devis renvoyé ou une
 *                       visite déplacée ramène l'appel ;
 *   etat                fait, ferme (« Fermer » : retiré de la liste sans
 *                       appel, David le 08/11), ou reporte (« Plus tard »)
 *                       jusqu'à reporte_au ;
 *   note                la note facultative de l'appel fait ;
 *   par_id, par_nom     qui (crm.utilisateurs), le nom recopié ;
 *   quand               l'heure de la décision ;
 *   dossier_id, request_id, client, motif, telephone, lien
 *                       recopiés au moment de la décision : la vue « Faits »
 *                       se lit sans les sources, qui ne montrent plus un
 *                       appel fait.
 *
 * Chaque appel fait est aussi inscrit au journal des gestes (crm.journal,
 * action « appel.fait ») : il se voit dans le Feed.
 */
export const SCHEMA_APPELS = `
create table if not exists crm.appels (
  source text not null check (source in ('visite','rappel','devis','nouvelle')),
  objet_id text not null,
  occurrence text not null default '',
  etat text not null check (etat in ('fait','reporte','ferme')),
  reporte_au timestamptz,
  note text,
  par_id int references crm.utilisateurs(id) on delete set null,
  par_nom text,
  quand timestamptz not null default now(),
  dossier_id int,
  request_id uuid,
  client text,
  motif text,
  telephone text,
  lien text,
  primary key (source, objet_id, occurrence)
);
create index if not exists idx_appels_etat_quand on crm.appels(etat, quand desc);
create index if not exists idx_appels_objet on crm.appels(objet_id);
alter table crm.appels enable row level security;
-- « Fermer » (08/11/2026) : la contrainte d'avant ne connaissait que fait et reporte.
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'appels_etat_check' and conrelid = 'crm.appels'::regclass
             and pg_get_constraintdef(oid) not like '%ferme%') then
    alter table crm.appels drop constraint appels_etat_check;
    alter table crm.appels add constraint appels_etat_check check (etat in ('fait','reporte','ferme'));
  end if;
end $$;
`;
