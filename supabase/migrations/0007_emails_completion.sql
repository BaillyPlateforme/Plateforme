-- ============================================================
-- 0007 — Mails entrants + complétion de demande par lien
-- ============================================================

-- Emails reçus (ligne de données à transformer en demande) — volontairement simple.
create table if not exists emails_recus (
  id            uuid primary key default gen_random_uuid(),
  expediteur    text,
  client_nom    text,
  client_email  text,
  client_tel    text,
  ville_depart  text,
  ville_arrivee text,
  volume_m3     numeric(8,2),
  sujet         text,
  corps         text,
  request_id    uuid references requests(id) on delete set null,
  status        text not null default 'nouveau',   -- 'nouveau' | 'traite'
  created_at    timestamptz not null default now()
);
create index if not exists emails_recus_created_idx on emails_recus (created_at desc);
alter table emails_recus enable row level security;

-- Jeton de complétion sur la demande (lien public pour compléter).
alter table requests add column if not exists completion_token uuid;
create index if not exists requests_completion_token_idx on requests (completion_token);

-- Condition "champ manquant" sur les règles (workflow incomplet).
alter table alerts add column if not exists condition_champ text;  -- 'volume' | 'depart' | 'arrivee'

-- URL publique du site (pour construire les liens de complétion).
alter table settings add column if not exists base_url text;
