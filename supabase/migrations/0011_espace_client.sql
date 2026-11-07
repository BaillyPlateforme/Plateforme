-- ============================================================
-- 0011 — L'espace client en tables, cloisonné par RLS
-- ============================================================
--
-- Jusqu'ici, l'espace client tenait dans un seul document JSON (démonstration
-- en mémoire, ou fichier du stockage). Il passe dans de vraies tables, toutes
-- préfixées `ec_`, dont les colonnes reprennent les noms des types de
-- packages/commun/src/lib/espace-client/types.ts.
--
-- Le cloisonnement (cahier des charges, §11) :
--
--   * un client est un compte Supabase Auth sans mot de passe, marqué
--     app_metadata.role = 'client' (seul le serveur peut écrire app_metadata) ;
--   * la clé publique ne LIT que les lignes du client connecté, et seulement
--     par une session ouverte par le lien d'accès (table ec_sessions) : une
--     session coupée par l'équipe, expirée ou fermée ne lit plus rien, même si
--     son jeton n'a pas encore expiré ;
--   * la clé publique n'ÉCRIT rien : ni politique d'écriture, ni privilège
--     INSERT/UPDATE/DELETE. Le serveur écrit avec la clé de service, après ses
--     propres contrôles ;
--   * les devis et les factures d'un grand compte masqué ne se lisent pas,
--     même par l'API : le masquage n'est pas qu'une affaire d'affichage.
--
-- Rien d'existant n'est modifié : aucune table, aucune ligne, aucun compte.
-- En particulier, pas de clé étrangère vers public.requests ni vers
-- auth.users — une clé étrangère poserait des déclencheurs sur la table
-- visée. Les identifiants y sont gardés tels quels, indexés.
--
-- Idempotente : elle se rejoue sans erreur et sans rien effacer.
-- Appliquée par scripts/appliquer-migrations.mjs, dans une transaction.

-- Les conseillers présentés aux clients --------------------------------------
create table if not exists public.ec_conseillers (
  id          uuid primary key default gen_random_uuid(),
  prenom      text not null,
  nom         text not null,
  email       text not null default '',
  telephone   text not null default '',
  -- Un conseiller fictif du jeu de démonstration.
  demo        boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Les clients ----------------------------------------------------------------
create table if not exists public.ec_clients (
  id                     uuid primary key default gen_random_uuid(),
  -- Le compte Supabase Auth du client, créé par le serveur au premier lien.
  auth_user_id           uuid unique,
  type                   text not null check (type in ('particulier', 'grand_compte')),
  civilite               text check (civilite in ('Madame', 'Monsieur')),
  prenom                 text not null,
  nom                    text not null,
  societe                text,
  email                  text not null check (email = lower(email) and position('@' in email) > 1),
  telephone              text not null default '',
  masquer_devis          boolean not null default false,
  masquer_factures       boolean not null default false,
  conseiller_id          uuid not null references public.ec_conseillers (id) on delete restrict,
  -- « Couper les sessions » : toute session ouverte avant cet instant ne vaut plus rien.
  sessions_revoquees_le  timestamptz,
  -- Un client fictif du jeu de démonstration (adresse @example.com).
  demo                   boolean not null default false,
  created_at             timestamptz not null default now()
);
create unique index if not exists ec_clients_email_uidx on public.ec_clients (email);
create index if not exists ec_clients_conseiller_idx on public.ec_clients (conseiller_id);

-- Les dossiers : tout se rattache au dossier, jamais au client ----------------
create table if not exists public.ec_dossiers (
  id                       uuid primary key default gen_random_uuid(),
  client_id                uuid not null references public.ec_clients (id) on delete cascade,
  reference                text not null unique check (reference ~ '^BD-[0-9]{4}-[0-9]{4,}$'),
  -- La demande des questionnaires d'origine (public.requests.id), sans clé étrangère.
  request_id               uuid,
  ville_depart             text not null,
  ville_arrivee            text not null,
  adresse_depart           text not null,
  adresse_arrivee          text not null,
  periode_debut            date not null,
  periode_fin              date not null,
  portee                   text not null check (portee in ('national', 'international')),
  mode_transport           text not null check (mode_transport in ('route', 'maritime', 'aerien')),
  pays_destination         text not null default 'FR' check (pays_destination ~ '^[A-Z]{2}$'),
  statut                   text not null check (statut in ('en_preparation', 'planifie', 'en_cours', 'termine')),
  volume_m3                numeric(7, 2) not null check (volume_m3 > 0),
  formule                  text not null,
  logement                 text,
  compagnie                text,
  numero_conteneur         text,
  url_tracking             text,
  statut_conteneur         text,
  navire                   text,
  port_depart              text,
  port_arrivee             text,
  eta                      date,
  cartons_non_necessaires  boolean not null default false,
  photo                    text not null,
  termine_le               timestamptz,
  avis_demande_le          timestamptz,
  created_at               timestamptz not null default now(),
  check (periode_fin >= periode_debut)
);
create index if not exists ec_dossiers_client_idx on public.ec_dossiers (client_id);
create index if not exists ec_dossiers_request_idx on public.ec_dossiers (request_id) where request_id is not null;

-- Devis et factures ------------------------------------------------------------
create table if not exists public.ec_devis (
  id                  uuid primary key default gen_random_uuid(),
  dossier_id          uuid not null references public.ec_dossiers (id) on delete cascade,
  numero              text not null unique,
  formule             text not null,
  lignes              jsonb not null default '[]'::jsonb check (jsonb_typeof(lignes) = 'array'),
  inclus              text[] not null default '{}',
  montant_ht          numeric(12, 2) not null,
  montant_ttc         numeric(12, 2) not null,
  arrhes_pourcentage  smallint not null default 0 check (arrhes_pourcentage between 0 and 100),
  statut              text not null check (statut in ('envoye', 'accepte', 'refuse', 'expire')),
  emis_le             date not null,
  valide_jusqu_au     date not null,
  accepte_le          date
);
create index if not exists ec_devis_dossier_idx on public.ec_devis (dossier_id);

create table if not exists public.ec_factures (
  id            uuid primary key default gen_random_uuid(),
  dossier_id    uuid not null references public.ec_dossiers (id) on delete cascade,
  devis_id      uuid references public.ec_devis (id) on delete set null,
  numero        text not null unique,
  type          text not null check (type in ('arrhes', 'solde', 'garde_meubles')),
  libelle       text not null,
  montant_ttc   numeric(12, 2) not null,
  statut        text not null check (statut in ('a_payer', 'payee', 'en_retard')),
  emise_le      date not null,
  echeance      date not null,
  periode       text check (periode ~ '^[0-9]{4}-[0-9]{2}$'),
  payee_le      date,
  paiement_ref  text
);
create index if not exists ec_factures_dossier_idx on public.ec_factures (dossier_id);

-- Pièces à fournir et documents -----------------------------------------------
create table if not exists public.ec_document_requirements (
  id           uuid primary key default gen_random_uuid(),
  -- null : exigée quelle que soit la destination.
  pays         text check (pays ~ '^[A-Z]{2}$'),
  libelle      text not null,
  description  text not null default '',
  obligatoire  boolean not null default true,
  ordre        integer not null default 0
);

create table if not exists public.ec_documents (
  id              uuid primary key default gen_random_uuid(),
  dossier_id      uuid not null references public.ec_dossiers (id) on delete cascade,
  categorie       text not null,
  libelle         text not null,
  source          text not null check (source in ('client', 'equipe')),
  -- Le chemin dans le seau privé « espace-client ».
  chemin          text not null,
  nom_fichier     text not null,
  taille_octets   bigint not null default 0,
  mime            text not null,
  requirement_id  uuid references public.ec_document_requirements (id) on delete set null,
  created_by      text not null,
  created_at      timestamptz not null default now()
);
create index if not exists ec_documents_dossier_idx on public.ec_documents (dossier_id);
create index if not exists ec_documents_requirement_idx on public.ec_documents (requirement_id) where requirement_id is not null;

-- Les engagements du client : quoi, quelle version, quand, depuis où ----------
create table if not exists public.ec_acceptations (
  id             uuid primary key default gen_random_uuid(),
  dossier_id     uuid not null references public.ec_dossiers (id) on delete cascade,
  type           text not null check (type in ('cgv', 'rgpd', 'conditions_livraison', 'declaration_valeurs', 'devis')),
  version_texte  text not null,
  accepted_at    timestamptz not null default now(),
  ip             text not null,
  user_agent     text not null,
  objet          text
);
create index if not exists ec_acceptations_dossier_idx on public.ec_acceptations (dossier_id);

-- Les formulaires du dossier ----------------------------------------------------
create table if not exists public.ec_declarations_valeurs (
  id          uuid primary key default gen_random_uuid(),
  dossier_id  uuid not null unique references public.ec_dossiers (id) on delete cascade,
  contenu     jsonb not null,
  total       numeric(12, 2) not null default 0,
  statut      text not null check (statut in ('brouillon', 'soumise')),
  soumise_at  timestamptz
);

create table if not exists public.ec_conditions_livraison (
  id                    uuid primary key default gen_random_uuid(),
  dossier_id            uuid not null unique references public.ec_dossiers (id) on delete cascade,
  adresse_livraison     text not null,
  etage                 smallint not null check (etage between 0 and 99),
  ascenseur             boolean not null,
  ascenseur_dimensions  jsonb,
  escalier              text not null check (escalier in ('aucun', 'droit', 'colimacon', 'etroit')),
  distance_portage_m    integer not null check (distance_portage_m >= 0),
  acces_poids_lourd     text not null check (acces_poids_lourd in ('oui', 'non', 'ne_sait_pas')),
  stationnement         text not null check (stationnement in ('facile', 'autorisation', 'reserve_client')),
  particularites_rue    text[] not null default '{}',
  monte_meuble          text not null check (monte_meuble in ('oui', 'non', 'a_evaluer')),
  horaires_restreints   text,
  -- Les photos jointes : [{ id, chemin, nom, taille, mime }], dans le seau privé.
  photos                jsonb not null default '[]'::jsonb check (jsonb_typeof(photos) = 'array'),
  commentaire           text,
  valide_at             timestamptz
);

-- Cartons ----------------------------------------------------------------------
create table if not exists public.ec_livraisons_cartons (
  id                 uuid primary key default gen_random_uuid(),
  dossier_id         uuid not null references public.ec_dossiers (id) on delete cascade,
  date_samedi        date not null,
  adresse            text not null,
  complement         text,
  code_acces         text,
  contact_nom        text not null,
  contact_tel        text not null,
  nb_cartons         integer check (nb_cartons between 0 and 500),
  ordre_passage      integer,
  creneau_debut      text check (creneau_debut ~ '^[0-9]{2}:[0-9]{2}$'),
  creneau_fin        text check (creneau_fin ~ '^[0-9]{2}:[0-9]{2}$'),
  lat                double precision,
  lng                double precision,
  statut             text not null check (statut in ('demandee', 'confirmee', 'livree')),
  creneau_envoye_le  timestamptz,
  created_at         timestamptz not null default now()
);
create index if not exists ec_livraisons_cartons_dossier_idx on public.ec_livraisons_cartons (dossier_id);
create index if not exists ec_livraisons_cartons_samedi_idx on public.ec_livraisons_cartons (date_samedi);

-- SAV --------------------------------------------------------------------------
create table if not exists public.ec_sav_declarations (
  id               uuid primary key default gen_random_uuid(),
  dossier_id       uuid not null references public.ec_dossiers (id) on delete cascade,
  numero           text not null unique,
  reserves_emises  boolean not null default false,
  date_constat     date not null,
  objets           text not null,
  description      text not null,
  photos           jsonb not null default '[]'::jsonb check (jsonb_typeof(photos) = 'array'),
  statut           text not null check (statut in ('recue', 'en_analyse', 'cloturee')),
  created_at       timestamptz not null default now()
);
create index if not exists ec_sav_declarations_dossier_idx on public.ec_sav_declarations (dossier_id);

-- Contenus communs à tous les espaces ------------------------------------------
create table if not exists public.ec_tutos (
  id         uuid primary key default gen_random_uuid(),
  titre      text not null,
  resume     text not null default '',
  categorie  text not null default '',
  duree_min  integer not null default 1,
  image      text not null,
  etapes     text[] not null default '{}',
  url_video  text,
  ordre      integer not null default 0,
  actif      boolean not null default true
);

create table if not exists public.ec_services (
  id              uuid primary key default gen_random_uuid(),
  titre           text not null,
  accroche        text not null default '',
  contenu         text not null default '',
  prix_indicatif  text,
  ordre           integer not null default 0,
  actif           boolean not null default true
);

-- Le journal des messages : tout e-mail ou SMS, envoyé ou non ------------------
create table if not exists public.ec_notifications (
  id            uuid primary key default gen_random_uuid(),
  dossier_id    uuid references public.ec_dossiers (id) on delete set null,
  canal         text not null check (canal in ('email', 'sms')),
  modele        text not null,
  destinataire  text not null,
  sujet         text not null,
  payload       jsonb not null default '{}'::jsonb,
  statut        text not null check (statut in ('journalisee', 'envoyee', 'echec')),
  erreur        text,
  sent_at       timestamptz not null default now()
);
create index if not exists ec_notifications_dossier_idx on public.ec_notifications (dossier_id);
create index if not exists ec_notifications_sent_idx on public.ec_notifications (sent_at desc);

-- Paiements (prestataire simulé, puis réel) ------------------------------------
create table if not exists public.ec_sessions_paiement (
  id          uuid primary key default gen_random_uuid(),
  cible       text not null check (cible in ('facture', 'devis_arrhes')),
  cible_id    uuid not null,
  dossier_id  uuid not null references public.ec_dossiers (id) on delete cascade,
  montant     numeric(12, 2) not null check (montant > 0),
  libelle     text not null,
  statut      text not null check (statut in ('ouverte', 'payee', 'annulee')),
  reference   text,
  trace       jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists ec_sessions_paiement_dossier_idx on public.ec_sessions_paiement (dossier_id);

-- Les liens d'accès ---------------------------------------------------------------
-- Le lien porte le `hashed_token` de Supabase Auth ; on n'en garde que
-- l'empreinte (SHA-256), pour la durée de validité propre à l'espace client
-- (15 minutes) et pour dire, sur la page d'arrivée, si le lien a déjà servi.
create table if not exists public.ec_liens_acces (
  empreinte     text primary key,
  client_id     uuid not null references public.ec_clients (id) on delete cascade,
  auth_user_id  uuid not null,
  -- Le dossier à ouvrir en arrivant, quand le lien vise un dossier précis.
  reference     text,
  expire_at     timestamptz not null,
  utilise_at    timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists ec_liens_acces_client_idx on public.ec_liens_acces (client_id);

-- Les sessions ouvertes par un lien ----------------------------------------------
-- La session elle-même est celle de Supabase Auth (cookies @supabase/ssr) ;
-- ce registre dit lesquelles valent pour l'espace client. Une session absente
-- d'ici — ouverte autrement que par le lien, fermée, expirée ou coupée par
-- l'équipe — ne lit rien.
create table if not exists public.ec_sessions (
  session_id    uuid primary key,
  client_id     uuid not null references public.ec_clients (id) on delete cascade,
  auth_user_id  uuid not null,
  ouverte_le    timestamptz not null default now(),
  expire_le     timestamptz not null,
  fermee_le     timestamptz,
  ip            text,
  user_agent    text
);
create index if not exists ec_sessions_client_idx on public.ec_sessions (client_id);

-- Les compteurs des numéros (dossiers, factures, SAV) ----------------------------
create table if not exists public.ec_compteurs (
  cle     text primary key,
  valeur  integer not null
);

-- ============================================================
-- Fonctions
-- ============================================================

-- Le client de la session en cours, ou null. SECURITY DEFINER : elle lit le
-- registre des sessions, que la clé publique ne voit pas. Elle ne rend que
-- l'identifiant du client appelant lui-même.
create or replace function public.ec_client_courant()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id
  from public.ec_sessions s
  join public.ec_clients c on c.id = s.client_id
  where s.session_id = nullif(auth.jwt() ->> 'session_id', '')::uuid
    and s.auth_user_id = auth.uid()
    and c.auth_user_id = auth.uid()
    and coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'client'
    and s.fermee_le is null
    and s.expire_le > now()
    and (c.sessions_revoquees_le is null or s.ouverte_le > c.sessions_revoquees_le)
  limit 1
$$;

-- Les dossiers du client de la session en cours.
create or replace function public.ec_dossiers_courants()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select d.id from public.ec_dossiers d where d.client_id = public.ec_client_courant()
$$;

-- Le client de la session en cours, si ses devis (ou ses factures) lui sont visibles.
create or replace function public.ec_voit_devis()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.ec_clients c where c.id = public.ec_client_courant() and not c.masquer_devis)
$$;

create or replace function public.ec_voit_factures()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.ec_clients c where c.id = public.ec_client_courant() and not c.masquer_factures)
$$;

-- Le compte Auth d'une adresse, s'il existe : son identifiant et son rôle.
-- Pour le serveur seul (clé de service) : avant de créer le compte d'un
-- client, savoir si l'adresse appartient déjà à l'équipe ou à un compte RH —
-- auquel cas on ne touche à rien.
create or replace function public.ec_compte_auth(p_email text)
returns table (id uuid, role text)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.raw_app_meta_data ->> 'role'
  from auth.users u
  where lower(u.email) = lower(p_email)
  limit 1
$$;

-- Le prochain numéro d'une série (« dossier-2026 », « facture-2026»…), sans
-- doublon même sous des demandes simultanées. `p_plancher` : le plus grand
-- numéro déjà attribué, pour reprendre la suite d'un jeu existant.
create or replace function public.ec_numero_suivant(p_cle text, p_plancher integer default 0)
returns integer
language sql
volatile
set search_path = ''
as $$
  insert into public.ec_compteurs as c (cle, valeur)
  values (p_cle, greatest(coalesce(p_plancher, 0), 0) + 1)
  on conflict (cle) do update set valeur = greatest(c.valeur, excluded.valeur - 1) + 1
  returning valeur
$$;

revoke all on function public.ec_client_courant() from public, anon;
revoke all on function public.ec_dossiers_courants() from public, anon;
revoke all on function public.ec_voit_devis() from public, anon;
revoke all on function public.ec_voit_factures() from public, anon;
revoke all on function public.ec_compte_auth(text) from public, anon, authenticated;
revoke all on function public.ec_numero_suivant(text, integer) from public, anon, authenticated;
grant execute on function public.ec_client_courant() to authenticated, service_role;
grant execute on function public.ec_dossiers_courants() to authenticated, service_role;
grant execute on function public.ec_voit_devis() to authenticated, service_role;
grant execute on function public.ec_voit_factures() to authenticated, service_role;
grant execute on function public.ec_compte_auth(text) to service_role;
grant execute on function public.ec_numero_suivant(text, integer) to service_role;

-- ============================================================
-- RLS : activée partout, lecture seule et seulement pour le client
-- ============================================================

-- Les privilèges d'abord : la clé publique (anon) n'a rien ; un compte
-- connecté (authenticated) peut lire les tables qu'un client a le droit de
-- voir, et rien écrire. La RLS filtre ensuite les lignes.
revoke all on table
  public.ec_conseillers, public.ec_clients, public.ec_dossiers, public.ec_devis, public.ec_factures,
  public.ec_document_requirements, public.ec_documents, public.ec_acceptations, public.ec_declarations_valeurs,
  public.ec_conditions_livraison, public.ec_livraisons_cartons, public.ec_sav_declarations, public.ec_tutos,
  public.ec_services, public.ec_notifications, public.ec_sessions_paiement, public.ec_liens_acces,
  public.ec_sessions, public.ec_compteurs
from anon, authenticated;

grant select on table
  public.ec_conseillers, public.ec_clients, public.ec_dossiers, public.ec_devis, public.ec_factures,
  public.ec_document_requirements, public.ec_documents, public.ec_acceptations, public.ec_declarations_valeurs,
  public.ec_conditions_livraison, public.ec_livraisons_cartons, public.ec_sav_declarations, public.ec_tutos,
  public.ec_services, public.ec_sessions_paiement
to authenticated;

alter table public.ec_conseillers enable row level security;
alter table public.ec_clients enable row level security;
alter table public.ec_dossiers enable row level security;
alter table public.ec_devis enable row level security;
alter table public.ec_factures enable row level security;
alter table public.ec_document_requirements enable row level security;
alter table public.ec_documents enable row level security;
alter table public.ec_acceptations enable row level security;
alter table public.ec_declarations_valeurs enable row level security;
alter table public.ec_conditions_livraison enable row level security;
alter table public.ec_livraisons_cartons enable row level security;
alter table public.ec_sav_declarations enable row level security;
alter table public.ec_tutos enable row level security;
alter table public.ec_services enable row level security;
alter table public.ec_notifications enable row level security;
alter table public.ec_sessions_paiement enable row level security;
alter table public.ec_liens_acces enable row level security;
alter table public.ec_sessions enable row level security;
alter table public.ec_compteurs enable row level security;

-- Une politique de lecture, créée si elle n'existe pas encore (pas de DROP).
create or replace function pg_temp.ec_lecture(p_table text, p_condition text)
returns void
language plpgsql
as $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = p_table and policyname = p_table || '_lecture_client'
  ) then
    execute format(
      'create policy %I on public.%I as permissive for select to authenticated using (%s)',
      p_table || '_lecture_client', p_table, p_condition
    );
  end if;
end;
$$;

-- `(select …)` : la fonction s'évalue une fois par requête, pas une fois par ligne.
select pg_temp.ec_lecture('ec_clients', 'id = (select public.ec_client_courant())');
select pg_temp.ec_lecture('ec_conseillers', 'id in (select c.conseiller_id from public.ec_clients c where c.id = (select public.ec_client_courant()))');
select pg_temp.ec_lecture('ec_dossiers', 'client_id = (select public.ec_client_courant())');
select pg_temp.ec_lecture('ec_devis', 'dossier_id in (select public.ec_dossiers_courants()) and (select public.ec_voit_devis())');
select pg_temp.ec_lecture('ec_factures', 'dossier_id in (select public.ec_dossiers_courants()) and (select public.ec_voit_factures())');
select pg_temp.ec_lecture('ec_documents', 'dossier_id in (select public.ec_dossiers_courants())');
select pg_temp.ec_lecture('ec_acceptations', 'dossier_id in (select public.ec_dossiers_courants())');
select pg_temp.ec_lecture('ec_declarations_valeurs', 'dossier_id in (select public.ec_dossiers_courants())');
select pg_temp.ec_lecture('ec_conditions_livraison', 'dossier_id in (select public.ec_dossiers_courants())');
select pg_temp.ec_lecture('ec_livraisons_cartons', 'dossier_id in (select public.ec_dossiers_courants())');
select pg_temp.ec_lecture('ec_sav_declarations', 'dossier_id in (select public.ec_dossiers_courants())');
select pg_temp.ec_lecture('ec_sessions_paiement', 'dossier_id in (select public.ec_dossiers_courants())');
-- Les contenus communs : à tout client connecté, seulement ce qui est publié.
select pg_temp.ec_lecture('ec_document_requirements', '(select public.ec_client_courant()) is not null');
select pg_temp.ec_lecture('ec_tutos', 'actif and (select public.ec_client_courant()) is not null');
select pg_temp.ec_lecture('ec_services', 'actif and (select public.ec_client_courant()) is not null');
-- ec_notifications, ec_liens_acces, ec_sessions, ec_compteurs : aucune
-- politique, donc aucune ligne pour la clé publique. Le journal contient les
-- liens d'accès des profils de démonstration : il ne se lit que côté serveur.

-- ============================================================
-- Le seau privé des fichiers
-- ============================================================
-- Privé : aucun fichier n'a d'adresse publique. Aucune politique sur
-- storage.objects : la clé publique n'y lit ni n'y écrit rien. Le serveur
-- dépose avec la clé de service, et sert chaque fichier par une URL signée de
-- 60 secondes, après avoir vérifié la session et le droit au dossier.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'espace-client', 'espace-client', false, 10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp']
)
on conflict (id) do nothing;
