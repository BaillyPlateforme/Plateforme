/*
 * La table de la discussion entre le client et l'équipe (public.ec_messages),
 * en une requête idempotente, rejouée sans effet : au démarrage du CRM (avec
 * son schéma, apps/interne/src/crm/lib/schema.ts) et, dans l'app externe, à
 * la première lecture ou écriture d'une discussion (discussion.ts). Rien ne
 * dépend donc d'une migration appliquée à la main ; la migration
 * supabase/migrations/0016_discussion_client.sql en garde la trace.
 *
 * Tout est dans un bloc qui ne fait rien quand la table existe déjà : un
 * démarrage ordinaire n'exécute aucune instruction de structure (pas de
 * verrou, pas de rechargement du cache de l'API). Sans l'espace client
 * (public.ec_dossiers absente, base neuve), rien non plus.
 *
 * Le cloisonnement est celui de la migration 0011 :
 *   - la clé publique ne LIT que les messages des dossiers du client de la
 *     session (ec_dossiers_courants(), qui exige une session inscrite au
 *     registre ec_sessions) ;
 *   - elle n'ÉCRIT rien : ni politique d'écriture, ni privilège. Le serveur
 *     écrit avec la clé de service (externe) ou le pool du CRM (interne),
 *     après ses propres contrôles.
 *
 * Pur : aucun import, il sert aux deux apps.
 */
export const SCHEMA_DISCUSSION = `
do $discussion$
begin
  if to_regclass('public.ec_dossiers') is null or to_regclass('public.ec_messages') is not null then
    return;
  end if;
  -- Deux serveurs qui démarrent ensemble ne créent pas la table deux fois.
  perform pg_advisory_xact_lock(hashtext('bailly.ec_messages'));
  if to_regclass('public.ec_messages') is not null then
    return;
  end if;

  create table public.ec_messages (
    id                uuid primary key default gen_random_uuid(),
    dossier_id        uuid not null references public.ec_dossiers (id) on delete cascade,
    -- Qui écrit : le client du dossier, ou un membre de l'équipe (en son nom, depuis le CRM).
    auteur            text not null check (auteur in ('client', 'equipe')),
    client_id         uuid references public.ec_clients (id) on delete set null,
    -- crm.utilisateurs.id, sans clé étrangère : le message survit au départ de son auteur.
    equipe_id         integer,
    -- Le nom affiché, recopié à l'écriture.
    auteur_nom        text not null,
    corps             text not null default '' check (length(corps) <= 4000),
    -- Une pièce jointe au plus (photo ou PDF), dans le seau privé « espace-client ».
    piece_chemin      text,
    piece_nom         text,
    piece_mime        text,
    piece_taille      bigint,
    created_at        timestamptz not null default now(),
    -- Lu par le client (messages de l'équipe), lu par l'équipe (messages du client).
    lu_par_client_le  timestamptz,
    lu_par_equipe_le  timestamptz,
    constraint ec_messages_contenu check (btrim(corps) <> '' or piece_chemin is not null),
    constraint ec_messages_auteur check ((auteur = 'client') = (equipe_id is null))
  );
  create index ec_messages_dossier_idx on public.ec_messages (dossier_id, created_at);
  -- La boîte de réception de l'équipe : les messages du client pas encore lus.
  create index ec_messages_non_lus_idx on public.ec_messages (dossier_id) where auteur = 'client' and lu_par_equipe_le is null;

  revoke all on table public.ec_messages from anon, authenticated;
  grant select on table public.ec_messages to authenticated;
  alter table public.ec_messages enable row level security;
  -- \`(select …)\` : la fonction s'évalue une fois par requête, pas une fois par ligne.
  create policy ec_messages_lecture_client on public.ec_messages as permissive for select to authenticated
    using (dossier_id in (select public.ec_dossiers_courants()));
end
$discussion$;
`;
