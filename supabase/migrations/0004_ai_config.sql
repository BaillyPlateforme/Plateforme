-- ============================================================
-- 0004 — Configuration de l'analyse d'image (éditable depuis l'app)
-- ============================================================
create table if not exists ai_config (
  id                boolean primary key default true,
  model             text not null default 'gemini-3.1-pro-preview',
  temperature       numeric(3,2) not null default 0.2,
  prompt_avant      text not null default '',
  prompt_apres      text not null default '',
  user_instruction  text not null default 'Analyse cette pièce et estime le volume de déménagement.',
  volume_references jsonb not null default '[]'::jsonb,
  updated_at        timestamptz not null default now(),
  constraint ai_config_singleton check (id)
);
create trigger ai_config_set_updated_at
  before update on ai_config for each row execute function set_updated_at();

alter table ai_config enable row level security;
