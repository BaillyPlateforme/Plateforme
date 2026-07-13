-- ============================================================
-- 0005 — Messagerie Brevo : templates + alertes configurables
-- ============================================================

create table if not exists message_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  channel     text not null default 'email',   -- 'email' | 'sms'
  event       text not null default 'manual',  -- déclencheur associé (ou 'manual')
  sujet       text,                             -- email uniquement
  contenu     text not null default '',
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger message_templates_set_updated_at
  before update on message_templates for each row execute function set_updated_at();

create table if not exists alerts (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  event               text not null,             -- 'demande_recue' | 'devis_cree' | 'devis_envoye' | ...
  montant_min         numeric(10,2),             -- condition : montant TTC minimal
  channel             text not null default 'email',   -- 'email' | 'sms'
  destinataire        text not null default 'client',  -- 'client' | 'custom'
  destinataire_custom text,                      -- email/téléphone fixe si 'custom'
  template_id         uuid references message_templates(id) on delete set null,
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create trigger alerts_set_updated_at
  before update on alerts for each row execute function set_updated_at();

alter table settings add column if not exists sms_sender text default 'Bailly';

alter table message_templates enable row level security;
alter table alerts enable row level security;
