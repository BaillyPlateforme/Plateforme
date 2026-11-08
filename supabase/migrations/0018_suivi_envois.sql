-- ============================================================
-- 0018 — Le suivi des e-mails aux clients (ouvertures, clics, portail)
-- ============================================================
--
-- Demande de David (novembre 2026) : « dans le parcours et sur les mails
-- client envoyés (envoi du devis, etc.), on doit pouvoir voir si le mail a
-- été ouvert, cliqué, si la personne a été sur le portail, etc. »
--
-- POUR MÉMOIRE : les tables n'attendent pas cette migration. Le même texte
-- (bloc ci-dessous, mot pour mot) est rejoué, sans effet quand elles
-- existent, au démarrage du CRM et au premier événement écrit par l'app
-- externe (packages/commun/src/lib/suivi-envois/schema.ts). Appliquer ce fichier sur
-- une base où elles existent déjà ne fait rien.
--
-- Deux tables, à côté du journal des envois (public.envois, migration 0013) :
--
--   * public.envois_liens : les liens d'un e-mail suivi, un par lien. Le lien
--     suivi (/t/c/<jeton>?l=<indice>) ne porte que son indice : la
--     destination est relue ici, jamais dans l'adresse (pas de redirection
--     ouverte). L'adresse complète est chiffrée (AES-256-GCM, clé du
--     serveur) : un lien d'accès à l'espace client ouvre l'espace d'un vrai
--     client. En clair : son libellé et sa destination sans la requête ;
--
--   * public.envois_evenements : délivré, ouverture, clic, rebond, plainte,
--     désinscription (Brevo), visite du portail, geste clé. Jamais d'IP en
--     clair (une empreinte HMAC tronquée), jamais l'agent complet (sa
--     famille). `automatique` : un relevé probablement fait par une machine
--     (Apple Mail, proxy d'images, antivirus).
--
-- Conservation : 13 mois (RETENTION_JOURS), purgés chaque jour par la tâche
-- de la veille (apps/interne/src/taches/suivi.ts).
--
-- Un index sur public.envois (brevo_id), pour le webhook de Brevo. Rien
-- d'autre d'existant n'est modifié. Pas de clé étrangère vers public.envois
-- (même règle que 0013).
--
-- Fermées à la clé publique (RLS sans politique, privilèges retirés).
-- Idempotente.

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
