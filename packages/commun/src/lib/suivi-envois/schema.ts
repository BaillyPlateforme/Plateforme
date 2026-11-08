/*
 * Le suivi des e-mails envoyés aux clients (David, novembre 2026 : « dans le
 * parcours et sur les mails client envoyés, on doit pouvoir voir si le mail a
 * été ouvert, cliqué, si la personne a été sur le portail »), en une requête
 * idempotente, rejouée sans effet : au démarrage du CRM (avec son schéma,
 * apps/interne/src/crm/lib/schema.ts) et, dans l'app externe, au premier
 * événement écrit (suivi/index.ts). Rien ne dépend donc d'une migration
 * appliquée à la main ; supabase/migrations/0018_suivi_envois.sql en garde
 * la trace, mot pour mot.
 *
 * Deux tables, à côté du journal des envois (public.envois, migration 0013) :
 *
 *   * public.envois_liens : les liens d'un e-mail suivi, un par lien. Le
 *     lien suivi (/t/c/<jeton>?l=<indice>) ne porte que son indice ; la
 *     destination est relue ICI, jamais dans l'adresse : ce n'est pas une
 *     redirection ouverte. L'adresse complète est chiffrée (AES-256-GCM) :
 *     un lien d'accès à l'espace client ouvre l'espace d'un vrai client, et
 *     le journal des envois ne garde jamais le corps d'un e-mail pour cette
 *     raison. En clair : le libellé du lien et sa destination sans la
 *     requête (hôte et chemin), pour l'affichage.
 *
 *   * public.envois_evenements : ce qui est arrivé à un e-mail et à son
 *     destinataire — délivré, ouvert, cliqué, rebond, plainte, désinscription
 *     (Brevo), visite du portail et gestes clés (consulté son devis,
 *     téléchargé le PDF…). Jamais d'adresse IP : son empreinte (HMAC
 *     tronqué, clé du serveur). Jamais l'agent complet : sa famille
 *     (apple_proxy, google_proxy, robot, navigateur…). `automatique` : un
 *     relevé probablement fait par une machine (protection de la vie privée
 *     d'Apple Mail, proxy d'images, antivirus qui suit les liens, quelques
 *     secondes après l'envoi) — affiché comme probable, jamais comme certain.
 *
 * Pas de clé étrangère vers public.envois (elle y poserait des
 * déclencheurs : même règle que 0013) ; les identifiants sont indexés. Une
 * visite du portail peut n'avoir aucun envoi (le client vient de lui-même).
 *
 * Conservation bornée : RETENTION_JOURS (13 mois), purgée chaque jour par la
 * tâche de la veille (apps/interne/src/taches/suivi.ts).
 *
 * Fermées à la clé publique (RLS sans politique, privilèges retirés) : seul
 * le serveur les lit et les écrit.
 *
 * Pur : aucun import, il sert aux deux apps.
 */

/** Combien de jours un événement et un lien suivi sont gardés : 13 mois. */
export const RETENTION_JOURS = 395;

export const SCHEMA_SUIVI = `
do $suivi_envois$
begin
  if to_regclass('public.envois') is null then
    return;
  end if;
  if to_regclass('public.envois_evenements') is not null and to_regclass('public.envois_liens') is not null
     and to_regclass('public.envois_brevo_idx') is not null then
    return;
  end if;
  -- Deux serveurs qui démarrent ensemble ne créent pas les tables deux fois.
  perform pg_advisory_xact_lock(hashtext('bailly.envois_suivi'));

  create table if not exists public.envois_liens (
    envoi_id      uuid not null,
    indice        smallint not null check (indice >= 0),
    libelle       text,
    destination   text not null,
    url_chiffree  text not null,
    cree_le       timestamptz not null default now(),
    primary key (envoi_id, indice)
  );
  create index if not exists envois_liens_cree_idx on public.envois_liens (cree_le);

  create table if not exists public.envois_evenements (
    id              bigint generated always as identity primary key,
    envoi_id        uuid,
    type            text not null check (type in ('delivre', 'ouverture', 'clic', 'rebond', 'plainte', 'desinscription', 'portail', 'action')),
    lien_indice     smallint,
    lien_libelle    text,
    lien_url        text,
    page            text,
    reference       text,
    ec_dossier_id   uuid,
    crm_dossier_id  integer,
    agent           text,
    empreinte_ip    text,
    automatique     boolean not null default false,
    detail          jsonb not null default '{}'::jsonb,
    cree_le         timestamptz not null default now()
  );
  create index if not exists envois_evenements_envoi_idx on public.envois_evenements (envoi_id, cree_le) where envoi_id is not null;
  create index if not exists envois_evenements_crm_idx on public.envois_evenements (crm_dossier_id, cree_le) where crm_dossier_id is not null;
  create index if not exists envois_evenements_ec_idx on public.envois_evenements (ec_dossier_id, cree_le) where ec_dossier_id is not null;
  create index if not exists envois_evenements_cree_idx on public.envois_evenements (cree_le);

  -- Le webhook de Brevo désigne un message par son identifiant (messageId).
  create index if not exists envois_brevo_idx on public.envois (brevo_id) where brevo_id is not null;

  revoke all on table public.envois_liens, public.envois_evenements from anon, authenticated;
  alter table public.envois_liens enable row level security;
  alter table public.envois_evenements enable row level security;

  comment on table public.envois_liens is 'Les liens des e-mails suivis : la destination chiffrée, relue par /t/c (jamais dans l''adresse). Conservés 13 mois.';
  comment on table public.envois_evenements is 'Ouvertures, clics, délivrance, rebonds (Brevo) et visites du portail des e-mails aux clients. Aucune IP en clair. Conservés 13 mois.';
end
$suivi_envois$;
`;
