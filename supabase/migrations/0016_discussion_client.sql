-- ============================================================
-- 0016 — La discussion entre le client et l'équipe (ec_messages)
-- ============================================================
--
-- Demande de David (novembre 2026) : « une fonction chat depuis l'espace
-- client qui permet au client de directement envoyer un message ou poser une
-- question ». Jusqu'ici, « Mon conseiller » n'envoyait qu'un e-mail au
-- conseiller (modèle message_conseiller), sans fil ni réponse possible. Les
-- anciens messages n'ont laissé qu'un e-mail : rien à reprendre.
--
-- POUR MÉMOIRE : la table n'attend pas cette migration. Le même texte (bloc
-- ci-dessous, mot pour mot) est rejoué, sans effet quand la table existe, au
-- démarrage du CRM et à la première discussion ouverte dans l'app externe
-- (packages/commun/src/lib/espace-client/discussion-schema.ts). Appliquer ce
-- fichier sur une base où la table existe déjà ne fait rien.
--
-- Une ligne par message :
--   * dossier_id : le dossier de l'espace client (ec_dossiers) ;
--   * auteur : 'client' ou 'equipe' ; client_id (le client du dossier) ou
--     equipe_id (crm.utilisateurs.id, sans clé étrangère), et auteur_nom,
--     recopié à l'écriture ;
--   * corps, et une pièce jointe au plus (piece_chemin dans le seau privé
--     « espace-client », piece_nom, piece_mime, piece_taille) ;
--   * created_at ; lu_par_client_le (messages de l'équipe) et
--     lu_par_equipe_le (messages du client).
--
-- Le cloisonnement est celui de 0011 : la clé publique ne lit que les
-- messages des dossiers du client de la session (ec_dossiers_courants(), qui
-- exige une session inscrite au registre ec_sessions, ni fermée ni expirée),
-- et n'écrit rien. Le serveur écrit après ses propres contrôles.
--
-- Rien d'existant n'est modifié. Idempotente.

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
  -- `(select …)` : la fonction s'évalue une fois par requête, pas une fois par ligne.
  create policy ec_messages_lecture_client on public.ec_messages as permissive for select to authenticated
    using (dossier_id in (select public.ec_dossiers_courants()));
end
$discussion$;
