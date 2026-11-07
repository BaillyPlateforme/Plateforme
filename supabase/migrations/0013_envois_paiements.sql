-- ============================================================
-- 0013 — Envois réels (Brevo), paiement en ligne (Stripe), tâches planifiées
-- ============================================================
--
-- Trois journaux, et rien d'autre :
--
--   * public.envois : chaque e-mail et chaque SMS de la plateforme
--     (questionnaires, espace client, CRM, tâche de la veille), envoyé ou
--     non, avec son statut, l'identifiant de Brevo et sa clé d'idempotence —
--     unique : deux envois sous la même clé sont impossibles. Écrit par le
--     module d'envoi (packages/commun/src/lib/envois) ;
--   * public.ec_paiements_stripe et public.ec_evenements_stripe : la session
--     Checkout de Stripe d'une session de paiement de l'espace client, et le
--     journal des webhooks reçus (un événement déjà traité ne refait rien).
--     Aucune donnée bancaire : des identifiants Stripe (cs_…, pi_…, evt_…) ;
--   * public.taches_executions : chaque exécution de la tâche de la veille,
--     son résultat, et le verrou du jour (une exécution automatique réussie
--     par jour au plus).
--
-- Rien d'existant n'est modifié : aucune table, aucune ligne, aucun compte.
-- Pas de clé étrangère vers les tables existantes (elle y poserait des
-- déclencheurs) : les identifiants sont gardés tels quels, indexés.
--
-- Fermées à la clé publique (RLS sans politique, privilèges retirés) : seul
-- le serveur, avec la clé de service, les lit et les écrit.
--
-- Idempotente : elle se rejoue sans erreur et sans rien effacer.
-- Appliquée par scripts/appliquer-migrations.mjs, dans une transaction.

-- 1. Le journal des envois -----------------------------------------------------
create table if not exists public.envois (
  id               uuid primary key default gen_random_uuid(),
  cle              text not null,
  canal            text not null check (canal in ('email', 'sms')),
  origine          text not null check (origine in ('espace_client', 'questionnaires', 'crm', 'veille', 'test')),
  modele           text,
  destinataire     text not null,
  sujet            text,
  -- Le texte d'un SMS. Jamais le corps d'un e-mail : un lien d'accès y ouvre l'espace d'un client.
  apercu           text,
  reference        text,
  -- La ligne du journal de l'espace client (ec_notifications) qui porte le message.
  notification_id  uuid,
  statut           text not null check (statut in ('en_cours', 'journalise', 'bloque', 'fictif', 'bac_a_sable', 'envoye', 'echec', 'incertain')),
  motif            text,
  mode             text not null check (mode in ('desactive', 'recette', 'actif')),
  bac_a_sable      boolean not null default false,
  brevo_id         text,
  tentatives       integer not null default 1,
  cree_le          timestamptz not null default now(),
  traite_le        timestamptz
);
create unique index if not exists envois_cle_idx on public.envois (cle);
create index if not exists envois_cree_idx on public.envois (cree_le desc);
create index if not exists envois_notification_idx on public.envois (notification_id) where notification_id is not null;

-- 2. Stripe ----------------------------------------------------------------------
create table if not exists public.ec_paiements_stripe (
  session_paiement_id  uuid primary key,
  checkout_id          text not null,
  url                  text,
  statut               text not null check (statut in ('ouverte', 'payee', 'en_attente', 'expiree', 'echouee')),
  payment_intent       text,
  montant_centimes     integer not null check (montant_centimes > 0),
  expire_le            timestamptz,
  cree_le              timestamptz not null default now(),
  maj_le               timestamptz not null default now()
);
create unique index if not exists ec_paiements_stripe_checkout_idx on public.ec_paiements_stripe (checkout_id);

create table if not exists public.ec_evenements_stripe (
  id                   text primary key,
  type                 text not null,
  checkout_id          text,
  session_paiement_id  uuid,
  recu_le              timestamptz not null default now(),
  traite_le            timestamptz,
  resultat             text
);
create index if not exists ec_evenements_stripe_recu_idx on public.ec_evenements_stripe (recu_le desc);

-- 3. Les exécutions des tâches planifiées ---------------------------------------------
create table if not exists public.taches_executions (
  id             uuid primary key default gen_random_uuid(),
  tache          text not null,
  -- Le jour d'exécution, à Paris ; la cible est le lendemain.
  jour           date not null,
  cible          date,
  declenchement  text not null check (declenchement in ('planifie', 'manuel')),
  -- Relancée à la main : elle passe outre le verrou du jour (les messages, eux, ne repartent pas).
  force          boolean not null default false,
  statut         text not null check (statut in ('en_cours', 'reussie', 'partielle', 'echec')),
  resultat       jsonb not null default '{}'::jsonb,
  par            text,
  debut          timestamptz not null default now(),
  fin            timestamptz
);
-- Le verrou du jour : une seule exécution automatique en cours ou réussie par tâche et par jour.
create unique index if not exists taches_executions_jour_idx
  on public.taches_executions (tache, jour)
  where statut in ('en_cours', 'reussie') and not force;
create index if not exists taches_executions_debut_idx on public.taches_executions (tache, debut desc);

-- 4. Fermées à la clé publique ------------------------------------------------------------
revoke all on table public.envois, public.ec_paiements_stripe, public.ec_evenements_stripe, public.taches_executions from anon, authenticated;
alter table public.envois enable row level security;
alter table public.ec_paiements_stripe enable row level security;
alter table public.ec_evenements_stripe enable row level security;
alter table public.taches_executions enable row level security;

comment on table public.envois is 'Le journal de chaque e-mail et SMS de la plateforme, envoyé ou non (packages/commun/src/lib/envois). Clé d''idempotence unique.';
comment on table public.ec_paiements_stripe is 'La session Checkout Stripe de chaque session de paiement de l''espace client. Aucune donnée bancaire.';
comment on table public.ec_evenements_stripe is 'Les webhooks Stripe reçus : un événement traité ne refait rien.';
comment on table public.taches_executions is 'Les exécutions de la tâche de la veille (apps/interne/src/taches).';

-- L'API recharge son schéma pour voir les tables nouvelles.
notify pgrst, 'reload schema';
