-- ============================================================
-- 0017 — Les tutoriels vus par chaque client (ec_tutos_vus)
-- ============================================================
--
-- Demande de David (novembre 2026) : « Fais de véritables tutoriels et un
-- vrai espace de tuto. » « Mes tutos » devient un espace d'apprentissage :
-- la progression du client (« 2 tutoriels sur 5 vus »), une pastille « Vu »
-- sur chaque tutoriel, « Marquer comme vu » (et la vidéo regardée jusqu'au
-- bout). La fiche de l'équipe montre combien de tutoriels le client a vus.
--
-- POUR MÉMOIRE : la table n'attend pas cette migration. Le même texte (bloc
-- ci-dessous, mot pour mot) est rejoué, sans effet quand la table existe, au
-- démarrage du CRM et au premier « vu » lu ou écrit dans l'app externe
-- (packages/commun/src/lib/espace-client/tutos-vus-schema.ts). Appliquer ce
-- fichier sur une base où la table existe déjà ne fait rien.
--
-- Une ligne par client et par tutoriel :
--   * client_id : le client de l'espace (ec_clients) — le « vu » est au
--     client, pas au dossier ;
--   * tuto_id : le tutoriel (ec_tutos) ;
--   * vu_le : le premier « vu » ; par : 'bouton' ou 'video' (regardée
--     jusqu'au bout).
-- Supprimer un client ou un tutoriel supprime ses lignes.
--
-- Le cloisonnement est celui de 0011 : la clé publique ne lit que les lignes
-- du client de la session (ec_client_courant(), qui exige une session
-- inscrite au registre ec_sessions, ni fermée ni expirée), et n'écrit rien.
-- Le serveur écrit avec la clé de service après ses propres contrôles
-- (session, tutoriel publié) ; pendant un aperçu de l'équipe, rien n'est
-- écrit.
--
-- Rien d'existant n'est modifié. Idempotente.

do $tutos_vus$
begin
  if to_regclass('public.ec_tutos') is null or to_regclass('public.ec_clients') is null or to_regclass('public.ec_tutos_vus') is not null then
    return;
  end if;
  -- Deux serveurs qui démarrent ensemble ne créent pas la table deux fois.
  perform pg_advisory_xact_lock(hashtext('bailly.ec_tutos_vus'));
  if to_regclass('public.ec_tutos_vus') is not null then
    return;
  end if;

  create table public.ec_tutos_vus (
    client_id  uuid not null references public.ec_clients (id) on delete cascade,
    tuto_id    uuid not null references public.ec_tutos (id) on delete cascade,
    vu_le      timestamptz not null default now(),
    -- Le bouton « Marquer comme vu », ou la vidéo regardée jusqu'au bout.
    par        text not null default 'bouton' check (par in ('bouton', 'video')),
    primary key (client_id, tuto_id)
  );

  revoke all on table public.ec_tutos_vus from anon, authenticated;
  grant select on table public.ec_tutos_vus to authenticated;
  alter table public.ec_tutos_vus enable row level security;
  -- `(select …)` : la fonction s'évalue une fois par requête, pas une fois par ligne.
  create policy ec_tutos_vus_lecture_client on public.ec_tutos_vus as permissive for select to authenticated
    using (client_id = (select public.ec_client_courant()));
end
$tutos_vus$;
