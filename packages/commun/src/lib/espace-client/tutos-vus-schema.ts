/*
 * Les tutoriels vus par chaque client (public.ec_tutos_vus), en une requête
 * idempotente, rejouée sans effet : au démarrage du CRM (avec son schéma,
 * apps/interne/src/crm/lib/schema.ts) et, dans l'app externe, à la première
 * lecture ou écriture d'un « vu » (tutos-vus.ts). Rien ne dépend donc d'une
 * migration appliquée à la main ; la migration
 * supabase/migrations/0017_tutos_vus.sql en garde la trace.
 *
 * Même construction que la discussion (discussion-schema.ts) : un bloc qui
 * ne fait rien quand la table existe déjà, ni sans l'espace client
 * (public.ec_tutos absente, base neuve).
 *
 * Une ligne par client et par tutoriel : le client, le tutoriel (une ligne
 * d'ec_tutos), le premier « vu » et la façon dont il l'a été (le bouton, ou
 * la fin de la vidéo). Le « vu » est au client, pas au dossier : un client
 * qui déménage deux fois n'a pas à revoir ses tutoriels.
 *
 * Le cloisonnement est celui de la migration 0011 :
 *   - la clé publique ne LIT que les lignes du client de la session
 *     (ec_client_courant(), qui exige une session inscrite au registre
 *     ec_sessions) ;
 *   - elle n'ÉCRIT rien : ni politique d'écriture, ni privilège. Le serveur
 *     écrit avec la clé de service, après ses propres contrôles (session,
 *     tutoriel publié, aperçu de l'équipe refusé).
 *
 * Pur : aucun import, il sert aux deux apps.
 */
export const SCHEMA_TUTOS_VUS = `
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
  -- \`(select …)\` : la fonction s'évalue une fois par requête, pas une fois par ligne.
  create policy ec_tutos_vus_lecture_client on public.ec_tutos_vus as permissive for select to authenticated
    using (client_id = (select public.ec_client_courant()));
end
$tutos_vus$;
`;
